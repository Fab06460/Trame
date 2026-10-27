// Processus principal du banc d'essai : ouvre la page construite (.build/index.html) et attend qu'elle ait fini.
const { app, BrowserWindow } = require('electron')
const path = require('path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1200,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
  })
  await win.loadFile(path.join(__dirname, '.build', process.env.FIDELITY_PAGE || 'index.html'))
  let title = ''
  for (let i = 0; i < 240 && title !== 'DONE' && title !== 'ERROR'; i++) {
    title = await win.webContents.executeJavaScript('document.title')
    await new Promise((r) => setTimeout(r, 250))
  }
  app.exit(title === 'DONE' ? 0 : 1)
})
