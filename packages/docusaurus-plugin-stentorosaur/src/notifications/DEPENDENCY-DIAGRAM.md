# Notification System - Dependency Diagram

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER CODE                                   │
│  (Docusaurus Plugin / GitHub Actions Script)                       │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ creates & calls
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   NotificationService                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  • initialize()                                               │  │
│  │  • notify(event, context)                                     │  │
│  │  • notifyBatch(request)                                       │  │
│  │  • getStats()                                                 │  │
│  │  • enableProvider() / disableProvider()                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────┬─────────────────┬──────────────────┬──────────────────────────┘
     │                 │                  │
     │                 │                  │ uses for DI
     │                 │                  │
     │                 │                  ▼
     │                 │         ┌──────────────────┐
     │                 │         │ ProviderLogger   │
     │                 │         │  (Interface)     │
     │                 │         └──────────────────┘
     │                 │                  ▲
     │                 │                  │ injects
     │                 │                  │
     │                 │ uses             │
     │                 ▼                  │
     │         ┌─────────────────────────┴─────────┐
     │         │    ProviderFactory                │
     │         │  ┌──────────────────────────────┐ │
     │         │  │  • createProvider(config)    │ │
     │         │  │  • registerCustomProvider()  │ │
     │         │  └──────────────────────────────┘ │
     │         │               │                    │
     │         │               │ loads              │
     │         │               ▼                    │
     │         │  ┌──────────────────────────────┐ │
     │         │  │   ProviderRegistry           │ │
     │         │  │  • Map<type, loader>         │ │
     │         │  │  • Lazy loading support      │ │
     │         │  └──────────────────────────────┘ │
     │         └────────────────┬──────────────────┘
     │                          │
     │                          │ instantiates
     │                          ▼
     │         ┌──────────────────────────────────────────┐
     │         │   BaseNotificationProvider<TConfig>      │
     │         │  ┌────────────────────────────────────┐  │
     │         │  │  TEMPLATE METHOD PATTERN           │  │
     │         │  │  • send(context)                   │  │
     │         │  │     ├─ checkRateLimit()            │  │
     │         │  │     ├─ shouldHandle()              │  │
     │         │  │     ├─ executeWithRetry()          │  │
     │         │  │     └─ updateStats()               │  │
     │         │  │                                    │  │
     │         │  │  ABSTRACT METHODS                  │  │
     │         │  │  • sendNotification(context)       │  │
     │         │  │  • validateProviderConfig()        │  │
     │         │  │                                    │  │
     │         │  │  HELPERS                           │  │
     │         │  │  • formatMessage(context)          │  │
     │         │  │  • createError() / createSuccess() │  │
     │         │  └────────────────────────────────────┘  │
     │         └──────────────────┬───────────────────────┘
     │                            │
     │                            │ extends
     │                            │
     │            ┌───────────────┼───────────────┬──────────────┐
     │            │               │               │              │
     │            ▼               ▼               ▼              ▼
     │    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │    │   Slack     │ │   Email     │ │   Webhook   │ │   Discord   │
     │    │  Provider   │ │  Provider   │ │  Provider   │ │  Provider   │
     │    └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
     │
     │                                   ... more providers
     │
     │ validates config
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ConfigValidator (Zod)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  • validateProviderConfig(config)                             │  │
│  │  • validateProviderConfigs(configs[])                         │  │
│  │  • resolveEnvVariable(value)                                  │  │
│  │  • formatZodError(error)                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Schemas:                                                           │
│  • baseProviderSchema                                               │
│  • slackProviderSchema                                              │
│  • emailProviderSchema                                              │
│  • webhookProviderSchema                                            │
│  • ... (discriminated union)                                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ uses types from
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Types Module                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  TYPE DEFINITIONS (No Runtime Dependencies)                   │  │
│  │                                                               │  │
│  │  • NotificationEvent (discriminated union)                   │  │
│  │     ├─ incident.opened / closed / updated                    │  │
│  │     ├─ maintenance.scheduled / started / completed           │  │
│  │     ├─ system.down / degraded / recovered                    │  │
│  │     └─ slo.breached                                          │  │
│  │                                                               │  │
│  │  • ProviderConfig (discriminated union)                      │  │
│  │     ├─ SlackProviderConfig                                   │  │
│  │     ├─ EmailProviderConfig                                   │  │
│  │     ├─ WebhookProviderConfig                                 │  │
│  │     └─ ... (extensible)                                      │  │
│  │                                                               │  │
│  │  • NotificationResult<T> (success/failure)                   │  │
│  │  • NotificationError (structured errors)                     │  │
│  │  • NotificationContext (event + metadata)                    │  │
│  │  • NotificationStats (metrics)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Notification Send Flow

```
┌─────────────────┐
│   User Code     │
│  notify(event)  │
└────────┬────────┘
         │
         │ 1. Call notify()
         ▼
┌─────────────────────────────────────────────┐
│     NotificationService                     │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ 2. Get enabled providers             │  │
│  │    from registry                     │  │
│  └──────────────┬───────────────────────┘  │
│                 │                           │
│  ┌──────────────▼───────────────────────┐  │
│  │ 3. Load providers if needed          │  │
│  │    (lazy loading)                    │  │
│  └──────────────┬───────────────────────┘  │
└─────────────────┼───────────────────────────┘
                  │
                  │ 4. Batch into chunks
                  │    (maxConcurrency: 5)
                  │
         ┌────────┼────────┬────────┐
         │        │        │        │
         ▼        ▼        ▼        ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │Provider│ │Provider│ │Provider│ │Provider│
    │   1    │ │   2    │ │   3    │ │   4    │
    └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │          │
        │ 5. Send  │          │          │
        │    in    │          │          │
        │  parallel│          │          │
        ▼          ▼          ▼          ▼
    ┌────────────────────────────────────────┐
    │     BaseProvider.send()                │
    │                                        │
    │  6. Check rate limit                  │
    │  7. Check shouldHandle()              │
    │  8. Execute with retry                │
    │     └─ Exponential backoff            │
    │  9. Update statistics                 │
    └────────┬───────────────────────────────┘
             │
             │ 10. Return result
             ▼
    ┌────────────────────────────────────────┐
    │   NotificationResult<void>             │
    │   { success: true/false, ... }         │
    └────────────────────────────────────────┘
             │
             │ 11. Collect all results
             ▼
    ┌────────────────────────────────────────┐
    │  Map<providerId, NotificationResult>   │
    └────────────────────────────────────────┘
             │
             │ 12. Return to user
             ▼
    ┌────────────────────────────────────────┐
    │         User Code                      │
    │  Check results, log failures           │
    └────────────────────────────────────────┘
```

### Provider Loading Flow (Lazy)

```
NotificationService.notify()
         │
         │ Need provider
         ▼
┌────────────────────────────────┐
│  Is provider loaded?           │
└────────┬───────────────────────┘
         │
    ┌────┴────┐
    │   YES   │   NO
    ▼         ▼
 Return    ┌──────────────────────────┐
 cached    │  ProviderFactory         │
 provider  │  .createProvider(config) │
           └──────────┬───────────────┘
                      │
                      ▼
           ┌──────────────────────────┐
           │  ProviderRegistry        │
           │  .getConstructor(type)   │
           └──────────┬───────────────┘
                      │
                      │ First time?
                 ┌────┴────┐
                 │   YES   │   NO
                 ▼         ▼
          ┌──────────┐  Return
          │ import() │  cached
          │ provider │  constructor
          │  module  │
          └─────┬────┘
                │
                ▼
          ┌──────────────────────┐
          │ Cache constructor    │
          └─────┬────────────────┘
                │
                ▼
          ┌──────────────────────┐
          │ new ProviderClass()  │
          └─────┬────────────────┘
                │
                ▼
          ┌──────────────────────┐
          │ provider.validate()  │
          └─────┬────────────────┘
                │
                ▼
          ┌──────────────────────┐
          │ Cache provider       │
          │ Return to service    │
          └──────────────────────┘
```

## Module Dependencies

```
types.ts (no dependencies)
   ▲
   │
   ├─────────────────────────────────────┐
   │                                     │
   │                                     │
config-validator.ts                     │
   ▲                                    │
   │ uses types                         │
   │                                    │
   │                              base-provider.ts
   │                                    ▲
   │                                    │ extends
   │                                    │
   │                         ┌──────────┼──────────┐
   │                         │          │          │
   │                    slack-provider  email-provider
   │                         │          │          │
   │                         └──────────┼──────────┘
   │                                    │
   │                                    │ registered in
   │                                    │
   │                              provider-factory.ts
   │                                    ▲
   │                                    │ uses
   │                                    │
   └──────────────────────> notification-service.ts
                                        ▲
                                        │
                                        │ created by
                                        │
                                   User Code
```

## Type Safety Flow

```
Configuration (Plain Object)
         │
         │ 1. Runtime validation
         ▼
┌────────────────────────────────┐
│  ConfigValidator (Zod)         │
│  • Parse & validate            │
│  • Resolve env vars            │
│  • Type inference              │
└────────────┬───────────────────┘
             │
             │ 2. Validated config
             │    (typed as ProviderConfig)
             ▼
┌────────────────────────────────┐
│  ProviderFactory               │
│  • Type narrowing via          │
│    discriminated union         │
└────────────┬───────────────────┘
             │
             │ 3. Specific config type
             │    (e.g., SlackProviderConfig)
             ▼
┌────────────────────────────────┐
│  SlackProvider                 │
│  constructor(                  │
│    config: SlackProviderConfig │
│  )                             │
└────────────┬───────────────────┘
             │
             │ 4. Type-safe access
             │    config.webhookUrl (string)
             │    config.mentionUsers (object?)
             ▼
     Provider Implementation
```

## Error Propagation

```
Provider Implementation
         │
         │ try/catch
         ▼
┌────────────────────────────────┐
│  createError() or              │
│  createSuccess()               │
└────────────┬───────────────────┘
             │
             │ NotificationResult<T>
             ▼
BaseProvider.sendNotification()
         │
         │ Wrapped in retry logic
         ▼
BaseProvider.send()
         │
         │ Updates statistics
         ▼
NotificationService.notify()
         │
         │ Collects results
         ▼
┌────────────────────────────────┐
│  Map<id, NotificationResult>   │
└────────────┬───────────────────┘
             │
             │ Each provider can
             │ succeed or fail
             │ independently
             ▼
         User Code
         │
         │ Checks success/failure
         │ for each provider
         ▼
    Error Handling / Logging
```

## Injection Points (Testing)

```
┌─────────────────────────────────────┐
│  NotificationService                │
│                                     │
│  constructor(                       │
│    config,                          │
│    providerFactory ◄────────────────┼─── Injectable
│  )                                  │    (Mock in tests)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  BaseNotificationProvider           │
│                                     │
│  constructor(                       │
│    config,                          │
│    logger ◄─────────────────────────┼─── Injectable
│  )                                  │    (Mock in tests)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Provider Implementation            │
│  (SlackProvider, etc.)              │
│                                     │
│  • HTTP client ◄────────────────────┼─── Mockable
│  • External dependencies            │    (jest.fn())
└─────────────────────────────────────┘
```

## Extensibility Points

```
User Provider Implementation
         │
         │ extends
         ▼
┌─────────────────────────────────────┐
│  BaseNotificationProvider           │
│  (Template method pattern)          │
└─────────────────────────────────────┘
         │
         │ registered via
         ▼
┌─────────────────────────────────────┐
│  registerCustomProvider()           │
│  or                                 │
│  registerCustomProviderLazy()       │
└─────────────────────────────────────┘
         │
         │ added to
         ▼
┌─────────────────────────────────────┐
│  ProviderRegistry                   │
│  (Global registry)                  │
└─────────────────────────────────────┘
         │
         │ available in
         ▼
┌─────────────────────────────────────┐
│  NotificationService                │
│  (Uses factory to create instances) │
└─────────────────────────────────────┘
```

## Concurrency Model

```
NotificationService.notify()
         │
         │ All providers
         ▼
┌────────────────────────────────────┐
│  [P1, P2, P3, P4, P5, P6, P7, P8]  │
└────────────────────────────────────┘
         │
         │ Chunk by maxConcurrency=5
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Chunk 1     Chunk 2
┌────────┐  ┌────────┐
│P1 P2 P3│  │P6 P7 P8│
│P4 P5   │  │        │
└───┬────┘  └───┬────┘
    │           │
    │ Parallel  │ Sequential
    │ (Promise  │ (Await chunk 1
    │  .all)    │  before chunk 2)
    │           │
    ▼           ▼
 Results    Results
    │           │
    └─────┬─────┘
          │
          │ Combined
          ▼
   Final Results Map
```

## Configuration Lifecycle

```
User provides config
         │
         ▼
┌─────────────────────────────┐
│  Plain JavaScript Object    │
└─────────────┬───────────────┘
              │
              │ 1. Validate
              ▼
┌─────────────────────────────┐
│  Zod Schema Parse           │
│  • Type checking            │
│  • Env var resolution       │
│  • Default values           │
└─────────────┬───────────────┘
              │
              │ 2. Typed config
              ▼
┌─────────────────────────────┐
│  ProviderConfig             │
│  (Validated & typed)        │
└─────────────┬───────────────┘
              │
              │ 3. Store in registry
              ▼
┌─────────────────────────────┐
│  NotificationService        │
│  providerRegistry.set()     │
└─────────────┬───────────────┘
              │
              │ 4. Used to create provider
              ▼
┌─────────────────────────────┐
│  Provider Instance          │
│  (Immutable config)         │
└─────────────────────────────┘
```
