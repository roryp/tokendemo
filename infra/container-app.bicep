targetScope = 'resourceGroup'

@description('Azure region for the Container Apps resources.')
param location string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Name of the azd environment. Used when generating resource names.')
param environmentName string

@description('Foundry account name for project RBAC.')
param aiFoundryAccountName string

@description('Foundry project name for project RBAC.')
param aiFoundryProjectName string

@description('Foundry project endpoint passed to the web app.')
param foundryProjectEndpoint string

@description('Instant model name passed to the web app.')
param modelName string = 'gpt-chat-latest'

@description('Retail pricing region passed to the web app.')
param pricingRegion string = location

var resourceToken = uniqueString(subscription().id, resourceGroup().id, location)
var normalizedEnvironmentName = toLower(replace(environmentName, '-', ''))
var containerAppName = take('ca-${environmentName}-${resourceToken}', 32)
var containerEnvironmentName = take('cae-${environmentName}-${resourceToken}', 60)
var logAnalyticsName = take('log-${environmentName}-${resourceToken}', 63)
var applicationInsightsName = take('appi-${environmentName}-${resourceToken}', 255)
var registryName = take('cr${normalizedEnvironmentName}${resourceToken}', 50)
var managedIdentityName = take('id-${environmentName}-${resourceToken}', 128)
var acrPullRoleDefinitionId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var azureAiUserRoleDefinitionId = '53ca6127-db72-4b80-b1b0-d745d6d5456d'
var serviceTags = union(tags, {
  'azd-service-name': 'web'
})

resource aiAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: aiFoundryAccountName

  resource project 'projects' existing = {
    name: aiFoundryProjectName
  }
}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, managedIdentity.id, acrPullRoleDefinitionId)
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource foundryProjectUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: aiAccount::project
  name: guid(aiAccount::project.id, managedIdentity.id, azureAiUserRoleDefinitionId)
  properties: {
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiUserRoleDefinitionId)
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Workspace-based Application Insights that stores the GenAI traces and token/cost metrics.
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Connect Application Insights to the Foundry project so token traces and the monitoring
// dashboard light up in the Foundry portal (Agents > Traces and Monitoring).
resource foundryAppInsightsConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-06-01' = {
  parent: aiAccount::project
  name: 'appinsights'
  properties: {
    category: 'AppInsights'
    target: applicationInsights.id
    authType: 'ApiKey'
    isSharedToAll: true
    credentials: {
      key: applicationInsights.properties.ConnectionString
    }
    metadata: {
      ApiType: 'Azure'
      ResourceId: applicationInsights.id
    }
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: serviceTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          env: [
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentity.properties.clientId
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_MODEL'
              value: modelName
            }
            {
              name: 'FOUNDRY_PRICING_REGION'
              value: pricingRegion
            }
            {
              name: 'FOUNDRY_PRICING_CURRENCY'
              value: 'USD'
            }
            {
              name: 'FOUNDRY_PRICING_SCOPE'
              value: 'Gl'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsights.properties.ConnectionString
            }
            {
              name: 'APPLICATIONINSIGHTS_ROLE_NAME'
              value: 'instantmodels-web'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    acrPullAssignment
    foundryProjectUserAssignment
  ]
}

output containerRegistryName string = registry.name
output containerRegistryEndpoint string = registry.properties.loginServer
output containerAppName string = containerApp.name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output managedIdentityId string = managedIdentity.id
output managedIdentityClientId string = managedIdentity.properties.clientId
output applicationInsightsName string = applicationInsights.name
output applicationInsightsId string = applicationInsights.id
