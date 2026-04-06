/**
 * src/index.js
 * Main entry point with intentional issues
 */

const { queryUser, validateInput } = require("./database");

// ISSUE 5: Using MD5 for password hashing (CRITICAL - Cryptographic weakness)
const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("md5").update(password).digest("hex");
}

// ISSUE 6: Weak random for security (HIGH)
function generateToken() {
  return Math.random().toString(36).substring(2, 15);
}

// ISSUE 7: Unsafe eval (CRITICAL)
function executeUserScript(script) {
  eval(script); // NEVER DO THIS!
}

// ISSUE 8: Missing error handling (MEDIUM)
async function fetchUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  const data = response.json();
  return data;
}

module.exports = {
  hashPassword,
  generateToken,
  executeUserScript,
  fetchUserData,
};
