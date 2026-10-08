const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const testsDir = path.join(__dirname, 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

let failed = false;

for (const file of files) {
    console.log(`\n=== Running ${file} ===`);
    try {
        cp.execSync(`node ${path.join('tests', file)}`, { stdio: 'inherit', cwd: __dirname });
    } catch (err) {
        failed = true;
        console.error(`\n❌ ${file} failed!`);
    }
}

if (failed) {
    console.error('\nSome tests failed.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed successfully.');
}
