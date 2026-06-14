// Blitz Talks - Azure Infrastructure
// Deploys: Azure Static Web App (Standard) + Storage Account (Table Storage)

targetScope = 'resourceGroup'

@description('Environment name')
@allowed(['prod', 'dev'])
param environment string = 'prod'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Azure region for Static Web App')
param swaLocation string = 'westus2'

@description('Custom domain for the Static Web App (e.g., blitz.k61.dev)')
param customDomain string = ''

@description('Azure AD Client ID for SWA authentication')
param aadClientId string = ''

@secure()
@description('Azure AD Client Secret for SWA authentication')
param aadClientSecret string = ''

param tags object = {
  project: 'blitz-talks'
  environment: environment
}

var resourceSuffix = environment == 'prod' ? '-prod' : '-${environment}'
var staticSiteName = 'swa-blitz-talks${resourceSuffix}'
var storageAccountName = 'stbt${uniqueString(resourceGroup().id)}${environment}'

// Storage Account
module storageAccount 'br/public:avm/res/storage/storage-account:0.19.0' = {
  name: 'storageAccountDeployment'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    kind: 'StorageV2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }

    tableServices: {
      tables: [
        { name: 'sessions' }
        { name: 'topics' }
        { name: 'votes' }
        { name: 'voters' }
        { name: 'gamekeepers' }
      ]
    }
  }
}

// Static Web App (Standard tier — required for custom auth with personal Microsoft accounts)
module staticSite 'br/public:avm/res/web/static-site:0.7.0' = {
  name: 'staticSiteDeployment'
  params: {
    name: staticSiteName
    location: swaLocation
    tags: tags
    sku: 'Standard'
    customDomains: customDomain != '' ? [customDomain] : []
  }
}

// Reference the storage account deployed by the module
resource storageAccountRef 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
  dependsOn: [storageAccount]
}

// Wire storage connection string and auth settings to SWA app settings
resource swaAppSettings 'Microsoft.Web/staticSites/config@2024-04-01' = {
  name: '${staticSiteName}/appsettings'
  properties: union(
    {
      AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountRef.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
    },
    aadClientId != '' ? { AAD_CLIENT_ID: aadClientId } : {},
    aadClientSecret != '' ? { AAD_CLIENT_SECRET: aadClientSecret } : {}
  )
  dependsOn: [
    staticSite
    storageAccount
  ]
}

// Outputs
output staticSiteName string = staticSite.outputs.name
output staticSiteDefaultHostname string = staticSite.outputs.defaultHostname
output storageAccountName string = storageAccount.outputs.name
