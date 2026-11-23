// Somente assets estáticos entram no cache. Respostas da API e fotos remotas nunca entram.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* A captura local continua disponível sem instalação. */
    });
  });
}
