(function(){
  const msg = document.getElementById('msg');
  const out = document.getElementById('out');
  const btn = document.getElementById('sendBtn');

  function setMsg(html){ msg.innerHTML = html; }
  function setOut(text){ out.textContent = text || ''; }

  async function requestFaucet(){
    setMsg(''); setOut(''); btn.disabled = true;
    const destinationWallet = document.getElementById('wallet').value.trim();
    const amount = parseInt(document.getElementById('amount').value, 10) || 1;

    try {
      const r = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationWallet, amount })
      });
      const data = await r.json();
      if (data.ok) {
        setMsg(`<span class="ok">✅ Sucesso!</span> TX: <span class="mono">${data.txId || '(sem txId no output)'}</span>`);
        setOut(data.stdout || '');
      } else {
        setMsg(`<span class="err">❌ Erro:</span> ${data.error || 'Falha'} (${data.reqId || '-'})`);
        setOut(data.detail || '');
      }
    } catch(e){
      setMsg('<span class="err">❌ Erro de rede</span>');
      setOut(String(e));
    } finally {
      btn.disabled = false;
    }
  }

  if (btn) btn.addEventListener('click', requestFaucet);
})();