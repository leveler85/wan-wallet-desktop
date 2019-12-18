import low from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import { app } from 'electron'
import Logger from './Logger'
import yargs from 'yargs'
import WalletHelper from '~/src/utils/Helper'

// caches for config
let _mode = undefined
let _network = undefined
let _lang = undefined
let _isDev = undefined
let _settings = undefined

const defaultConfig = {
    mode: 'light',
    network: 'main',
    lang: 'en',
    settings: {
      reinput_pwd: false,
      staking_advance: false,
      logout_timeout: '5',
      tokens_advance: {
        main: {
          "0x28362cd634646620ef2290058744f9244bb90ed9": {
            "select": false,
            "symbol": "ETH",
            "decimals": 18,
            "ccSelect": false,
          },
          "0xd15e200060fc17ef90546ad93c1c61bfefdc89c7": {
            "select": false,
            "symbol": "BTC",
            "decimals": 8,
            "ccSelect": false
          },
        },
        testnet: {
          "0x46397994a7e1e926ea0de95557a4806d38f10b0d": {
            "select": false,
            "symbol": "ETH",
            "decimals": 18,
            "ccSelect": false
          },
          "0x89a3e1494bc3db81dadc893ded7476d33d47dcbd": {
            "select": false,
            "symbol": "BTC",
            "decimals": 8,
            "ccSelect": false
          },
        }
      }
    }
}

const tokensAdvanceKey = [ 'select', 'ccSelect', 'symbol', 'decimals', 'tokenOrigAddr', 'chain']

const cscContractAddr = "0x00000000000000000000000000000000000000da";

const htlcAddresses = {
  testnet: {
    weth: '0xfbaffb655906424d501144eefe35e28753dea037',
    eth: '0x358b18d9dfa4cce042f2926d014643d4b3742b31',
  },
  main: {
    weth: '0x7a333ba427fce2e0c6dd6a2d727e5be6beb13ac2',
    eth: '0x78eb00ec1c005fec86a074060cc1bc7513b1ee88',
  }
};

const argv = yargs
                .options({
                    'network': {
                        demand: false,
                        default: null,
                        describe: 'Network to connect to: main or testnet',
                        nargs: 1,
                        type: 'string'
                    },
                    'mode': {
                        demand: false,
                        default: null,
                        describe: 'Mode the wallet will be running on',
                        nargs: 1,
                        type: 'string'
                    }
                })
                .help('h')
                .alias('h', 'help')
                .argv

/** Setting class */
class Settings {
    /**
     * Create an instance of Settings with a logger appended
     */
    constructor() {
        this._logger = Logger.getLogger('settings')
        this._logger.info('setting initialized')
        let path = app.getPath('userData');
        this._logger.info('User data path: ' + path);
        this._db = low(new FileSync(path + '/config.json'))
        this.updateSettingsByConfig()
    }

    updateSettingsByConfig() {
      let settings = this.get('settings');
      Object.keys(defaultConfig.settings).forEach(item => {
        if(settings[item] === undefined) {
          this.set(`settings.${item}`, defaultConfig.settings[item])
        }
      })
    }

    updateTokensAdvance(tokens) {
      let network = this.get('network');
      let tokens_advance = this.tokens_advance;
      tokens.forEach(item => {
        if(!tokens_advance[item.tokenWanAddr]) {
          tokens_advance[item.tokenWanAddr] = {};
          switch (item.chain) {
            case 'ETH':
              tokens_advance[item.tokenWanAddr].erc20Select = false;
              break;
            case 'EOS':
              tokens_advance[item.tokenWanAddr].eosSelect = false;
              break;
          }
          tokensAdvanceKey.forEach(key => tokens_advance[item.tokenWanAddr][key] = item[key] || false);
          this.set(`settings.tokens_advance.${network}.${item.tokenWanAddr}`, tokens_advance[item.tokenWanAddr]);
        } else {
          tokensAdvanceKey.forEach(key => {
            if(tokens_advance[item.tokenWanAddr][key] === undefined) {
              tokens_advance[item.tokenWanAddr][key] = false;
              this.set(`settings.tokens_advance.${network}.${item.tokenWanAddr}.${key}`, false);
            }
          });

        }
      })
    }

    get appName() {
        return 'WAN Wallet'
    }

    get cscContractAddr() {
        return cscContractAddr;
    }

    get htlcAddresses() {
      return htlcAddresses[this.get('network')];
    }

    get tokens_advance() {
      let network = this.get('network');
      return this.get(`settings.tokens_advance.${network}`);
    }

    get isDev() {
        if (_isDev) {
            return _isDev
        }

        return _isDev = process.env.NODE_ENV === 'development'
    }

    /**
     * Return application directory
     * @return {string} application data path, platform dependent
     */
    get userDataPath() {
        return app.getPath('userData')
    }

    get appLogPath() {
        return WalletHelper.getLogPath()
    }

    /**
     * Return mode of WanWallet, light or full 
     * @return {string} wallet mode, light or full
     */
    get mode() {
        if (_mode) {
            return _mode
        }

        if (argv.mode) {
            return _mode = argv.mode
        }

        return _mode = this._get('mode') || defaultConfig.mode
    }

    /**
     * Return the network wallet is connected to, either main or testnet
     * @return {string} wanchain network, either mainnet or testnet
     */
    get network() {
        if (_network) {
            return _network
        }

        if (argv.network) {
            return _network = argv.network
        } 

        return _network = this._get('network') || defaultConfig.network
    }

    get language() {
        if (_lang) {
            return _lang
        }

        if (argv.lang) {
            return _lang = argv._lang
        }
        
        return _lang = this._get('lang') || defaultConfig.lang
    }

    get settings() {
      if (_settings) {
          return _settings
      }
      
      return _settings = this._get('settings') || defaultConfig.settings
    }

    get autoLockTimeout() {
        // auto lock the wallet if main window loses focus for a period of time. 5 min
        const logout = this.settings.logout_timeout || defaultConfig.settings.logout_timeout

        return Number.parseInt(logout) * 60 * 1000;
    }

    get idleCheckInterval() {
        return 1 * 60 * 1000
    }

    get(key) {
      return this._get(key)
    }

    _get(key) {
      let val = this._db.get(key).value();
      if (!val) {
        val = defaultConfig[key];
        this._set(key, defaultConfig[key]);
      }
      return val;
    }

    set(key, value) {
        this._set(key, value)
    }

    _set(key, value) {
        this._db.set(key, value).write()
    }

    remove(key) {
      this._remove(key)
    }

    _remove(key) {
      this._db.unset(key).write()
    }

    switchNetwork() {
        const beforeSwitchNetwork = _network
        _network = undefined

        const [ afterSwitchNetwork ] = ['main', 'testnet'].filter(item => item !== beforeSwitchNetwork)

        this._set('network', afterSwitchNetwork)

        _network = afterSwitchNetwork
    }
    
    switchLang(langCode) {
        const beforeSwitchLang = _lang
        _lang = undefined

        this._set('lang', langCode)

        _lang = langCode
    }
}

export default new Settings()
