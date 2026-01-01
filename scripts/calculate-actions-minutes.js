#!/usr/bin/env node

/**
 * Calculate GitHub Actions minutes used per month for amiable-dev/amiable-docusaurus
 *
 * This script fetches workflow run data and calculates billable minutes.
 *
 * Usage:
 *   GITHUB_TOKEN=your_token node scripts/calculate-actions-minutes.js
 *
 * Options:
 *   --months N    Number of months to analyze (default: 3)
 *   --verbose     Show detailed output
 */

const { Octokit } = require('@octokit/rest');

const OWNER = 'amiable-dev';
const REPO = 'amiable-docusaurus';

// GitHub Actions billing multipliers (for private repos)
// Public repos have unlimited free minutes
const BILLING_MULTIPLIERS = {
  'ubuntu-latest': 1,    // Linux: 1x
  'ubuntu-20.04': 1,
  'ubuntu-22.04': 1,
  'windows-latest': 2,   // Windows: 2x
  'windows-2019': 2,
  'windows-2022': 2,
  'macos-latest': 10,    // macOS: 10x
  'macos-11': 10,
  'macos-12': 10,
  'macos-13': 10,
};

async function getWorkflowRuns(octokit, startDate, endDate) {
  const runs = [];
  let page = 1;
  const perPage = 100;

  console.log(`Fetching workflow runs from ${startDate.toISOString()} to ${endDate.toISOString()}...`);

  while (true) {
    const response = await octokit.actions.listWorkflowRunsForRepo({
      owner: OWNER,
      repo: REPO,
      per_page: perPage,
      page,
      created: `${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`,
    });

    runs.push(...response.data.workflow_runs);

    if (response.data.workflow_runs.length < perPage) {
      break;
    }

    page++;
  }

  return runs;
}

async function getJobsForRun(octokit, runId) {
  const response = await octokit.actions.listJobsForWorkflowRun({
    owner: OWNER,
    repo: REPO,
    run_id: runId,
  });

  return response.data.jobs;
}

function calculateJobDuration(job) {
  if (!job.started_at || !job.completed_at) {
    return 0;
  }

  const start = new Date(job.started_at);
  const end = new Date(job.completed_at);
  const durationMs = end - start;
  const durationMinutes = Math.ceil(durationMs / 1000 / 60); // Round up to nearest minute

  return durationMinutes;
}

function getRunnerMultiplier(runnerName) {
  if (!runnerName) return 1;

  for (const [key, multiplier] of Object.entries(BILLING_MULTIPLIERS)) {
    if (runnerName.toLowerCase().includes(key.toLowerCase())) {
      return multiplier;
    }
  }

  return 1; // Default to Linux multiplier
}

async function analyzeMonthlyUsage(octokit, months = 3, verbose = false) {
  const now = new Date();
  const monthlyData = {};

  // Initialize monthly buckets
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[monthKey] = {
      runs: 0,
      jobs: 0,
      totalMinutes: 0,
      billableMinutes: 0,
      workflows: {},
      runners: {},
    };
  }

  // Fetch workflow runs for the entire period
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const endDate = now;

  const runs = await getWorkflowRuns(octokit, startDate, endDate);

  console.log(`\nFound ${runs.length} workflow runs in the last ${months} months\n`);

  // Process each run
  for (const run of runs) {
    const runDate = new Date(run.created_at);
    const monthKey = `${runDate.getFullYear()}-${String(runDate.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) continue;

    monthlyData[monthKey].runs++;

    // Get jobs for this run
    const jobs = await getJobsForRun(octokit, run.id);

    for (const job of jobs) {
      const duration = calculateJobDuration(job);
      const multiplier = getRunnerMultiplier(job.runner_name);
      const billableMinutes = duration * multiplier;

      monthlyData[monthKey].jobs++;
      monthlyData[monthKey].totalMinutes += duration;
      monthlyData[monthKey].billableMinutes += billableMinutes;

      // Track by workflow
      const workflowName = run.name || run.path;
      if (!monthlyData[monthKey].workflows[workflowName]) {
        monthlyData[monthKey].workflows[workflowName] = {
          runs: 0,
          minutes: 0,
          billableMinutes: 0,
        };
      }
      monthlyData[monthKey].workflows[workflowName].runs++;
      monthlyData[monthKey].workflows[workflowName].minutes += duration;
      monthlyData[monthKey].workflows[workflowName].billableMinutes += billableMinutes;

      // Track by runner
      const runnerType = job.runner_name || 'unknown';
      if (!monthlyData[monthKey].runners[runnerType]) {
        monthlyData[monthKey].runners[runnerType] = {
          jobs: 0,
          minutes: 0,
          billableMinutes: 0,
        };
      }
      monthlyData[monthKey].runners[runnerType].jobs++;
      monthlyData[monthKey].runners[runnerType].minutes += duration;
      monthlyData[monthKey].runners[runnerType].billableMinutes += billableMinutes;

      if (verbose) {
        console.log(`  [${monthKey}] ${workflowName}: ${duration}min (${billableMinutes} billable) on ${runnerType}`);
      }
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return monthlyData;
}

function printReport(monthlyData) {
  console.log('\n=== GitHub Actions Usage Report ===\n');
  console.log(`Repository: ${OWNER}/${REPO}\n`);

  const sortedMonths = Object.keys(monthlyData).sort().reverse();

  let totalRuns = 0;
  let totalJobs = 0;
  let totalMinutes = 0;
  let totalBillableMinutes = 0;

  for (const month of sortedMonths) {
    const data = monthlyData[month];
    totalRuns += data.runs;
    totalJobs += data.jobs;
    totalMinutes += data.totalMinutes;
    totalBillableMinutes += data.billableMinutes;

    console.log(`Month: ${month}`);
    console.log(`  Workflow Runs: ${data.runs}`);
    console.log(`  Total Jobs: ${data.jobs}`);
    console.log(`  Actual Minutes: ${data.totalMinutes.toLocaleString()}`);
    console.log(`  Billable Minutes: ${data.billableMinutes.toLocaleString()}`);

    // Top workflows
    const topWorkflows = Object.entries(data.workflows)
      .sort((a, b) => b[1].billableMinutes - a[1].billableMinutes)
      .slice(0, 5);

    if (topWorkflows.length > 0) {
      console.log('\n  Top Workflows:');
      for (const [name, stats] of topWorkflows) {
        console.log(`    - ${name}: ${stats.runs} runs, ${stats.billableMinutes} billable minutes`);
      }
    }

    // Runner breakdown
    console.log('\n  By Runner Type:');
    for (const [runner, stats] of Object.entries(data.runners)) {
      console.log(`    - ${runner}: ${stats.jobs} jobs, ${stats.minutes} min (${stats.billableMinutes} billable)`);
    }

    console.log('\n');
  }

  console.log('=== Overall Totals ===');
  console.log(`Total Runs: ${totalRuns}`);
  console.log(`Total Jobs: ${totalJobs}`);
  console.log(`Total Actual Minutes: ${totalMinutes.toLocaleString()}`);
  console.log(`Total Billable Minutes: ${totalBillableMinutes.toLocaleString()}`);

  if (totalRuns > 0) {
    console.log(`\nAverage per Run: ${Math.round(totalMinutes / totalRuns)} minutes (${Math.round(totalBillableMinutes / totalRuns)} billable)`);
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Usage: GITHUB_TOKEN=your_token node scripts/calculate-actions-minutes.js');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  let months = 3;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--months' && args[i + 1]) {
      months = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }

  const octokit = new Octokit({ auth: token });

  try {
    const monthlyData = await analyzeMonthlyUsage(octokit, months, verbose);
    printReport(monthlyData);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

main();
