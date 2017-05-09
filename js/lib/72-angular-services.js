angular.module('MoneyNetworkW2')

    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
            var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;

            var bitcoin_networks = [{value: 'BTC', text: 'Bitcoin'}, { value:'tBTC', text: 'Bitcoin TestNet'}] ;
            var bitcoin_network = bitcoin_networks[1] ; // TestNet

            function get_bitcoin_networks () {
                return bitcoin_networks ;
            }
            function get_bitcoin_network () {
                return bitcoin_network ;
            }
            function set_bitcoin_network (network) {
                bitcoin_network = network ;
            }

            var api_client ;
            function init_api_client () {
                if (api_client) return ;
                api_client = blocktrail.BlocktrailSDK({
                    apiKey: API_Key,
                    apiSecret: API_Secret,
                    network: bitcoin_network.value,
                    testnet: (bitcoin_network.value == 'tBTC')
                });
            }

            var bitcoin_wallet ;
            var bitcoin_wallet_backup_info ;
            function create_new_wallet(wallet_id, wallet_password, cb) {
                if (bitcoin_wallet) return 'Wallet already present' ;
                if (!wallet_id || !wallet_password) return 'Wallet ID and/or password is missing' ;
                init_api_client() ;
                api_client.createNewWallet(wallet_id, wallet_password, function (err, wallet, backupInfo) {
                    //    console.log('createNewWallet: ');
                    //    console.log('walletid = ' + walletid);
                    //    console.log('walletpwd = ' + walletpwd);
                    //    console.log('err = ' + CircularJSON.stringify(err));
                    //    console.log('wallet = ' + CircularJSON.stringify(wallet));
                    //    console.log('backupInfo = ' + CircularJSON.stringify(backupInfo));
                    if (!err) {
                        bitcoin_wallet = wallet ;
                        bitcoin_wallet_backup_info = backupInfo ;
                        console.log('Backup info = ' + CircularJSON.stringify(backupInfo)) ;
                    }
                    cb(err) ;
                }) ; // createNewWallet
            } // create_new_wallet

            function delete_wallet(cb) {
                if (!bitcoin_wallet) return cb('Delete wallet failed. No active wallet') ;
                bitcoin_wallet.deleteWallet(
                    function () {
                        console.log('deleteWalletOK (2): arguments.length = ' + arguments.length);
                        for (var i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
                        cb(JSON.stringify(arguments)) ;
                        // deleteWalletOK: arguments.length = 2
                        // all.js:69845 arguments[0] = null
                        // all.js:69845 arguments[1] = true
                    },
                    function (args) {
                        console.log('deleteWalletError (2): arguments.length = ' + arguments.length);
                        for (var i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
                        cb(JSON.stringify(arguments)) ;
                    }
                ); // deleteWallet

            } // delete_wallet


            // export MoneyNetworkW2Service
            return {
                get_bitcoin_networks: get_bitcoin_networks,
                get_bitcoin_network: get_bitcoin_network,
                set_bitcoin_network: set_bitcoin_network,
                create_new_wallet: create_new_wallet,
                delete_wallet: delete_wallet
            };

            // end MoneyNetworkW2Service
        }])

;
