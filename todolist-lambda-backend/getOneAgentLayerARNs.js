const https = require('https');

/**
 * determine latest OneAgent extension layer ARNs
 * @returns
 */
module.exports.get = async (sls) => {
  const paasToken = process.env.DT_PAAS_TOKEN;
  if (paasToken == null) {
    throw new Error('missing DT_PAAS_TOKEN environment variable');
  }

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
        accept: '*/*',
        Authorization: `Api-Token ${paasToken}`,
      },
    };

    https.get(
      `${connetionBaseUrl}/api/v1/deployment/agent/lambda/latest`,
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
            const { versions } = JSON.parse(data);

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
