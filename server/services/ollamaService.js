const envConfig = require('../config/env');

/**
 * Documentation of Error Scenarios:
 * 1. Unavailable Service: The local Ollama daemon is not running/reachable.
 * 2. Unavailable Model: The configured model is not available locally.
 */
class OllamaService {
  static _getProviderConfig() {
    return {
      endpoint: envConfig.ollamaEndpoint || 'http://localhost:11434',
      model: envConfig.ollamaModelName || 'llama3',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  /**
   * Verifies if local Ollama is reachable and if the configured model is available.
   * @returns {Promise<{isReachable: boolean, hasModel: boolean, details: string}>}
   */
  static async checkHealth() {
    let conf;
    try {
      conf = this._getProviderConfig();
    } catch (error) {
      return { isReachable: false, hasModel: false, details: error.message };
    }

    try {
      const response = await fetch(`${conf.endpoint}/tags`, { //available models endpoint
        headers: conf.headers,
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) {
        return { isReachable: true, hasModel: false, details: `Reachable but returned status: ${response.status}` };
      }

      const data = await response.json();
      const models = data.models || [];
      
      const hasModel = models.some(m => m.name === conf.model || m.name.startsWith(conf.model + ':'));

      return {
        isReachable: true,
        hasModel,
        details: hasModel ? `Model '${conf.model}' is ready.` : `Model '${conf.model}' not found on local provider.`
      };
    } catch (error) {
      return {
        isReachable: false,
        hasModel: false,
        details: `Ollama endpoint unreachable: ${error.message}`
      };
    }
  }

  /**
   * Generates text using the configured local Ollama instance.
   * @param {string} prompt - The natural language prompt.
   * @param {object} options - Optional overrides.
   * @returns {Promise<string>} The generated text.
   */
  static async generateText(prompt, options = {}) {
    if (!prompt) throw new Error('Prompt cannot be empty');

    const conf = this._getProviderConfig();
    const timeoutMs = options.timeoutMs || (envConfig.requestTimeoutMs * 3); 
    
    let response;
    try {
      response = await fetch(`${conf.endpoint}/generate`, { // response endpoint for generating text
        method: 'POST',
        headers: conf.headers,
        body: JSON.stringify({
          model: conf.model,
          prompt,
          stream: false, 
          ...(options.format ? { format: options.format } : {})
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new Error(`Inference request timed out after ${timeoutMs}ms.`);
      }
      throw new Error(`Ollama network failure: ${error.message}`);
    }

    if (response.status === 404) {
      throw new Error(`Model '${conf.model}' not found. Run 'ollama pull ${conf.model}'.`);
    }
    if (response.status === 400) {
      throw new Error(`Invalid model name or bad request sent to Ollama (HTTP 400).`);
    }
    if (!response.ok) {
      throw new Error(`Inference failed with unexpected status: ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.response) {
      throw new Error('Malformed inference response from Ollama.');
    }

    return data.response;
  }
}

module.exports = OllamaService;

