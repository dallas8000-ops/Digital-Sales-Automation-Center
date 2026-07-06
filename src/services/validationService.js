// Validation Service - Validates email/domain for real prospects
const https = require('https');
const { promisify } = require('util');

const httpsRequest = promisify((url, options, callback) => {
  https.get(url, options, callback).on('error', callback);
});

/**
 * Validate email address using Hunter.io API
 * @param {string} email - Email to validate
 * @param {string} apiKey - Hunter.io API key
 * @returns {Promise<object>} Validation result
 */
async function validateEmail(email, apiKey) {
  if (!apiKey) {
    return {
      email,
      valid: null,
      reason: 'No Hunter API key configured',
      sources: [],
      score: null
    };
  }

  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&domain=${email.split('@')[1]}&api_key=${apiKey}`;
    
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (response.data) {
      return {
        email,
        valid: response.data.status === 'valid',
        reason: response.data.status,
        score: response.data.score,
        sources: response.data.sources || []
      };
    } else if (response.errors) {
      return {
        email,
        valid: null,
        reason: response.errors[0]?.details || 'Hunter API error',
        sources: [],
        score: null
      };
    }
  } catch (error) {
    console.error('Email validation error:', error.message);
    return {
      email,
      valid: null,
      reason: error.message,
      sources: [],
      score: null
    };
  }
}

/**
 * Validate domain existence and get email pattern
 * @param {string} domain - Domain to validate
 * @param {string} apiKey - Hunter.io API key
 * @returns {Promise<object>} Domain validation result
 */
async function validateDomain(domain, apiKey) {
  if (!apiKey) {
    return {
      domain,
      valid: null,
      reason: 'No Hunter API key configured',
      pattern: null
    };
  }

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`;
    
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    if (response.data) {
      return {
        domain,
        valid: true,
        reason: 'Domain found',
        pattern: response.data.pattern,
        emails_count: response.data.emails_count || 0
      };
    } else if (response.errors) {
      return {
        domain,
        valid: false,
        reason: response.errors[0]?.details || 'Domain not found',
        pattern: null,
        emails_count: 0
      };
    }
  } catch (error) {
    console.error('Domain validation error:', error.message);
    return {
      domain,
      valid: null,
      reason: error.message,
      pattern: null,
      emails_count: null
    };
  }
}

/**
 * Validate a prospect's email/domain
 * @param {object} prospect - Prospect object with email/domain
 * @param {object} options - Options including validateEmail, validateDomain, apiKey
 * @returns {Promise<object>} Prospect with validation results
 */
async function validateProspect(prospect, options = {}) {
  const { validateEmail: shouldValidateEmail, validateDomain: shouldValidateDomain, apiKey } = options;
  
  const validation = {
    email: null,
    domain: null,
    timestamp: new Date().toISOString()
  };

  if (shouldValidateEmail && prospect.email) {
    validation.email = await validateEmail(prospect.email, apiKey);
  }

  if (shouldValidateDomain && prospect.website) {
    const domain = prospect.website.replace(/^https?:\/\//, '').split('/')[0];
    validation.domain = await validateDomain(domain, apiKey);
  }

  return {
    ...prospect,
    validation: {
      ...prospect.validation,
      ...validation
    }
  };
}

/**
 * Batch validate multiple prospects
 * @param {array} prospects - Array of prospect objects
 * @param {object} options - Options including validateEmail, validateDomain, apiKey, batchSize
 * @returns {Promise<array>} Validated prospects
 */
async function batchValidateProspects(prospects, options = {}) {
  const { batchSize = 5 } = options;
  const validated = [];

  for (let i = 0; i < prospects.length; i += batchSize) {
    const batch = prospects.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(p => validateProspect(p, options))
    );
    validated.push(...batchResults);
  }

  return validated;
}

module.exports = {
  validateEmail,
  validateDomain,
  validateProspect,
  batchValidateProspects
};
