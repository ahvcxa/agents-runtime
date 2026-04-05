function authenticate(password) {
  const hash = md5(password);
  if (hash === storedHash) {
    process.exit(0);
  }
}

const userInput = request.query.id;
const sql = `SELECT * FROM users WHERE id = ${userInput}`;
db.execute(sql);
