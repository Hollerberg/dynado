const https = require('https');
const { URL } = require('url');

/* ----------------------------------------------------------------------------

# An excerpt of a sample serverless.yml using queryOneAgentLayerARNs.js

#
# required to enable serverless async variable resolution
#
variablesResolutionMode: '20210326'

functions:
  helloWorld:
    handler: index.hello
    # reference custom.OneAgentLayerARNs.nodejs to include OneAgent layer
    layers: ${self:custom.OneAgentLayerARNs.nodejs}
    # reference custom.OneAgentConfig with OneAgent configuration from Lambda deployment screen
    environment: ${self:custom.OneAgentConfig}

custom:
  #
  # specify PAAS token. Alternatively, specify environment variable DT_PAAS_TOKEN
  # PAAS token is required to access Dynatrace deployment APIs
  #
  queryOneAgentLayerARNs:
    paasToken: <PAAS token>

  #
  # OneAgentLayerARNs will be resolved to the latest version of OneAgent layer ARNs e.g.
  #
  # OneAgentLayerARNs:
  #   python: arn:aws:lambda:us-east-1:725887861453:layer:Dynatrace_OneAgent_1_217_1_python:1
  #   java: arn:aws:lambda:us-east-1:725887861453:layer:Dynatrace_OneAgent_1_217_10_java:1
  #   nodejs: arn:aws:lambda:us-east-1:725887861453:layer:Dynatrace_OneAgent_1_217_1_nodejs:1
  OneAgentLayerARNs: ${file(./queryOneAgentLayerARNs.js):get}

  #
  # alternatively, a specific runtime layer ARN can be resolved directly
  #
  # resolves to:
  # OneAgentNodeLayerARN: arn:aws:lambda:us-east-1:725887861453:layer:Dynatrace_OneAgent_1_217_1_nodejs:1
  #
  OneAgentNodeLayerARN: ${file(./queryOneAgentLayerARNs.js):nodejs}

  # settings copied from Dynatrace Lambda deployment screen (serverless deployment mode)
  OneAgentConfig:
    AWS_LAMBDA_EXEC_WRAPPER: /opt/dynatrace
    DT_TENANT: xyzsfsdf
    DT_CLUSTER_ID: 2041375367
    DT_CONNECTION_BASE_URL: https://xyzsfsdf.live.dynatrace.com
    DT_CONNECTION_AUTH_TOKEN: xxxxxx.xxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

  -------------------------------------------------------------------------- */

/**
 * determine latest OneAgent extension layer ARNs
 * preconditions:
 * - the new serverless framework asychnronous variable resolver must be enabled. in order to do so,
 *   add `variablesResolutionMode: '20210326'` to the toplevel of your serverless.yml file.
 * - DT_PAAS_TOKEN environment varible contains PaaS token required to query deployment API (alternatively,
 *   specify custom.queryOneAgentLayerARNs.paasToken in serverless configuration)
 * - OneAgent configuration - expected to be copied custom.OneAgentConfig
 *
 * @returns JSON document with layer name for every supported runtime
 */
module.exports.get = async (sls) => {
  // lookup paas token from custom.queryOneAgentLayerARNs.paasToken
  let paasToken = await sls.resolveConfigurationProperty([
    'custom',
    'queryOneAgentLayerARNs',
    'paasToken',
  ]);

  if (paasToken == null) {
    // paas token not in defined in config file -> try environment
    paasToken = process.env.DT_PAAS_TOKEN;
  }

  if (paasToken == null) {
    throw new Error(
      'neither custom.queryOneAgentLayerARNs.paasToken nor DT_PAAS_TOKEN environment variable defined'
    );
  }

  // resolve region and connection base url
  const [region, connetionBaseUrl] = await Promise.all([
    sls.resolveConfigurationProperty(['provider', 'region']),
    sls.resolveConfigurationProperty([
      'custom',
      'OneAgentConfig',
      'DT_CONNECTION_BASE_URL',
    ]),
  ]);

  if (region == null) {
    return Promise.reject(new Error('could not resolve AWS region'));
  }

  if (connetionBaseUrl == null) {
    return Promise.reject(
      new Error(
        'could not resolve DT_CONNECTION_BASE_URL from custom.OneAgentConfig'
      )
    );
  }

  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        accept: 'application/json',
        Authorization: `Api-Token ${paasToken}`,
      },
    };

    https.get(
      new URL(`/api/v1/deployment/lambda/agent/latest`, connetionBaseUrl),
      opts,
      (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `Could not retrieve OneAgent layer names - request failed with ${res.statusCode}`
            )
          );
        }
        let data = '';
        res.on('data', (chunk) => {
          data += `${chunk}`;
        });
        res.on('end', () => {
          try {
            // version is a Record with runtime name as key and according partial layername
            const versions = JSON.parse(data);

            // transform the partial layer names to full ARNs
            const transformed = {};
            Object.getOwnPropertyNames(versions).forEach((runtime) => {
              const partialLayerName = versions[runtime];
              transformed[
                runtime
              ] = `arn:aws:lambda:${region}:725887861453:layer:${partialLayerName}_${runtime}:1`;
            });
            resolve(transformed);
          } catch (e) {
            reject(new Error(`could not parse layer names - ${e}`));
          }
        });
        res.on('error', reject);
      }
    );
  });
};

/**
 * export runtime specific layer ARN
 * returns the OneAgent layer ARN for a specific runtime technology.
 *
 * @see queryOneAgentLayerARNs for configuration and preconditions.
 */
['nodejs', 'python', 'java'].forEach((runtime) => {
  module.exports[runtime] = async (sls) => {
    const layerARNs = await module.exports.get(sls);
    return layerARNs[runtime];
  };
});
