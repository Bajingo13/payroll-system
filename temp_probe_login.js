(async () => {
  const cases = [
    { username: 'admin', password: '1234' },
    { username: 'admin', password: 'admin' }
  ];
  for (const c of cases) {
    const res = await fetch('http://localhost:12687/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c)
    });
    const text = await res.text();
    console.log('CASE', c, 'STATUS', res.status, 'BODY', text);
  }
})();
