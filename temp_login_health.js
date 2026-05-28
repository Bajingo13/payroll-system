(async () => {
  const db = await fetch('http://localhost:12687/api/db-test');
  console.log('DB_TEST_STATUS', db.status);
  console.log('DB_TEST_BODY', await db.text());

  const login = await fetch('http://localhost:12687/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' })
  });
  console.log('LOGIN_STATUS', login.status);
  console.log('LOGIN_BODY', await login.text());
})();
