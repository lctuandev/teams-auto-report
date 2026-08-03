const { createBackup } = require("./data-snapshot");
const result = createBackup();
console.log(`Backup created: ${result.name}`);
console.log(`Included: ${result.included.join(", ")}`);
