/**
 * Example Docusaurus configuration using the status plugin
 * 
 * Copy this configuration to your docusaurus.config.js
 */

module.exports = {
  title: 'My Site',
  tagline: 'Documentation with status monitoring',
  url: 'https://example.com',
  baseUrl: '/',
  
  organizationName: 'your-org',
  projectName: 'your-repo',
  
  // ... other config
  
  plugins: [
    [
      'docusaurus-plugin-status',
      {
        // GitHub repository configuration
        // If not specified, uses organizationName/projectName from above
        owner: 'your-org',
        repo: 'your-repo',
        
        // Define which systems/processes to monitor
        systemLabels: [
          'api',           // API services
          'website',       // Main website
          'database',      // Database systems
          'auth',          // Authentication services
          'ci-cd',         // CI/CD pipeline
          'docs',          // Documentation site
          'support',       // Support processes
          'onboarding',    // Onboarding process
        ],
        
        // GitHub token for API access
        // IMPORTANT: Use environment variable, don't commit token
        token: process.env.GITHUB_TOKEN,
        
        // Label used to identify status issues
        statusLabel: 'status',
        
        // How often to update (in minutes)
        updateInterval: 60,
        
        // Where to store status data
        dataPath: 'status-data',
        
        // Status page customization
        title: 'System Status',
        description: 'Current operational status of our systems and processes',
        
        // UI options
        showResponseTimes: true,
        showUptime: true,
      },
    ],
  ],
  
  // ... rest of your config
};
