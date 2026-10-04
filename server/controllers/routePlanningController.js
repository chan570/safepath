const WorkflowOrchestratorService = require('../services/workflowOrchestratorService');

/**
 * Endpoint for SafePath's core route planning.
 * Exposes the internal WorkflowOrchestrator as a consistent JSON REST API.
 */
exports.planRoute = async (req, res, next) => {
  try {
    const { prompt, resolvedOrigin, resolvedDestination } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'A natural language routing prompt is required.'
      });
    }

    const payload = {
      prompt,
      resolvedOrigin,
      resolvedDestination
    };

    const result = await WorkflowOrchestratorService.planRoute(payload);

    // Map internal domain statuses to appropriate HTTP status codes
    let statusCode = 200;

    switch (result.status) {
      case 'success':
        statusCode = 200;
        break;
      case 'clarification_required':
        statusCode = 422; // Unprocessable Entity (Semantic error with prompt)
        break;
      case 'no_results':
        statusCode = 404; // Not Found
        break;
      case 'unsupported_constraint':
        statusCode = 400; // Bad Request
        break;
      case 'provider_error':
        statusCode = 502; // Bad Gateway
        break;
      case 'internal_error':
        statusCode = 500;
        break;
      default:
        statusCode = 500;
        result.status = 'internal_error';
    }

    return res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
};
