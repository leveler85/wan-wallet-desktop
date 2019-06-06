import { app, ipcMain as ipc } from 'electron'
import { autoUpdater } from 'electron-updater'
import Logger from '~/src/utils/Logger'
import Windows from '~/src/modules/windows'

class WalletUpdater {
    constructor() {
        this.updater = autoUpdater
        
        this._logger = Logger.getLogger('updater')
        this.updater.logger = this._logger

        // config updater
        this.updater.fullChangelog = true
        this.updater.autoInstallOnAppQuit = false
        this.updater.autoDownload = false
        this.updater.allowDowngrade = false
    }

    start() {
        if (process.env.NODE_ENV === 'development') {
            return
        }

        let updateModal

        ipc.on('upgrade', async (event, actionUni, payload) => {
          let ret, err
          const [action, id] = actionUni.split('#')
      
          switch(action) {
            case 'start': 
      
              let choice = parseInt(payload.choice)

              let updateChoiceMsg = choice === 1 ? 'Upgrade' : "Do not upgrade"

              this._logger.info(`user update choice ${updateChoiceMsg}`)

              if (choice === 1) {
                  this.updater.downloadUpdate()
              } else if (choice === 0) {
                  updateModal.close()
              }

              break
          }
        })

        this.updater.on('checking-for-update', () => {
          this._logger.info('checking for updates...')
        })

        this.updater.on('update-available', (info) => {
          updateModal = Windows.createModal('systemUpdate', {
            width: 1024 + 208, 
            height: 720, 
            alwaysOnTop: true
          })

          updateModal.window.webContents.once('dom-ready', () => {
            updateModal.window.webContents.openDevTools()
          })
                
          const updateInfo = {
            currVersion: app.getVersion(),
            releaseVersion: info.version,
            releaseDate: new Date(info.releaseDate),
            releaseNotes: info.releaseNotes[0].note
          }
      
          updateModal.on('ready', () => {
            updateModal.webContents.send('updateInfo', 'versionInfo', JSON.stringify(updateInfo))
          })
        })

        this.updater.on('error', (err) => {
          console.log('updater error', err)
          this._logger.error(`updater error: ${err.stack}`)
        })

        this.updater.on('download-progress', (progressObj) => {
          let logMsg = 'Download speed: ' + parseFloat(progressObj.bytesPerSecond / 125) + ' kbps'
          logMsg = logMsg + ' - Download ' + parseFloat(progressObj.percent).toFixed(2) + '%'
          logMsg = logMsg + ' (' + progressObj.transferred + "/" + progressObj.total + ')'
          this._logger.info(`download progess: ${logMsg}`)
        })

        this.updater.on('update-downloaded', (info) => {
            updateModal.webContents.send('updateInfo', 'upgradeProgress', 'done')
            setTimeout(() => {
              this.updater.quitAndInstall()
            }, 3 * 1000)
        })

        this.updater.checkForUpdates()

    }
}

export default new WalletUpdater()