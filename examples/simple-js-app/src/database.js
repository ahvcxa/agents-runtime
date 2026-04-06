/**
 * src/database.js
 * Example file with intentional issues for demo
 */

// ISSUE 1: Hardcoded credentials (CRITICAL - Security)
const DB_PASSWORD = "admin123456";
const API_KEY = "sk_live_abcdef123456789";

// ISSUE 2: SQL Injection vulnerability (CRITICAL)
function queryUser(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  // Should use parameterized query
  return database.execute(query);
}

// ISSUE 3: High cyclomatic complexity (HIGH)
function validateInput(value, type) {
  if (type === "email") {
    if (value && value.includes("@")) {
      if (value.includes(".")) {
        if (value.split("@")[1].includes(".")) {
          if (value.length < 255) {
            if (value.split(".")[1].length > 1) {
              return true;
            }
          }
        }
      }
    }
  } else if (type === "phone") {
    if (value && value.match(/^\d+$/)) {
      if (value.length >= 10) {
        if (value.length <= 15) {
          return true;
        }
      }
    }
  } else if (type === "url") {
    if (value && value.startsWith("http")) {
      if (value.includes(".")) {
        if (!value.includes(" ")) {
          return true;
        }
      }
    }
  }
  return false;
}

// ISSUE 4: Code duplication (MEDIUM - DRY violation)
function formatUserData(user) {
  const name = user.first_name + " " + user.last_name;
  const email = user.email.toLowerCase();
  const phone = user.phone.replace(/\D/g, "");
  return { name, email, phone };
}

function formatCustomerData(customer) {
  const name = customer.first_name + " " + customer.last_name;
  const email = customer.email.toLowerCase();
  const phone = customer.phone.replace(/\D/g, "");
  return { name, email, phone };
}

module.exports = {
  queryUser,
  validateInput,
  formatUserData,
  formatCustomerData,
};
