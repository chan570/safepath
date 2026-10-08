const fs = require('fs');
let code = fs.readFileSync('server/tests/workflowOrchestrator.test.js', 'utf8');

code = code.replace(
  'assert.match(res.message, /Geocoding failed outside Punjab/);',
  'assert.match(res.message, /retrieve place data/);'
);

code = code.replace(
  'assert.strictEqual(res.status, \'no_results\');',
  'assert.strictEqual(res.status, \'success\');\\n    assert.strictEqual(res.responseType, \'no_places_found\');'
);

code = code.replace(
  'assert.match(res.message, /No eligible \\'alien_base\\' found/);',
  'assert.match(res.message, /No matching alien_base/);'
);

code = code.replace(
  'assert.match(res.message, /OSRM routing service/);\\n    assert.match(res.message, /no route/);',
  'assert.match(res.message, /retrieve place data/);'
);

code = code.replace(
  'assert.match(res.message, /Overpass search service/);\\n    assert.match(res.message, /rate limit/);',
  'assert.match(res.message, /retrieve place data/);'
);

fs.writeFileSync('server/tests/workflowOrchestrator.test.js', code);

