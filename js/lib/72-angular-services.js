
angular.module('MoneyNetworkW2')

    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
            var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;
            var api_client, bitcoin_wallet, bitcoin_wallet_backup_info ;
            function get_wallet_status () {
                return (bitcoin_wallet ? 'open' : 'n/a') ;
            }

            function init_api_client () {
                if (api_client) return ;
                api_client = blocktrail.BlocktrailSDK({
                    apiKey: API_Key,
                    apiSecret: API_Secret,
                    network: 'BTC',
                    testnet: true
                });
                return api_client ;
            }

            function generate_random_string(length, use_special_characters) {
                var character_set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                if (use_special_characters) character_set += '![]{}#%&/()=?+-:;_-.@$|£' ;
                var string = [], index, char;
                for (var i = 0; i < length; i++) {
                    index = Math.floor(Math.random() * character_set.length);
                    char = character_set.substr(index, 1);
                    string.push(char);
                }
                return string.join('');
            } // generate_random_string

            function create_new_wallet (wallet_id, wallet_password, cb) {
                var pgm = service + '.create_new_wallet: ' ;
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing') ;
                init_api_client() ;
                api_client.createNewWallet(wallet_id, wallet_password, function (err, wallet, backupInfo) {
                    if (!err) {
                        bitcoin_wallet = wallet ;
                        console.log('Wallet = ' + CircularJSON.stringify(wallet)) ;
                        bitcoin_wallet_backup_info = backupInfo ;
                        console.log('Backup info = ' + CircularJSON.stringify(backupInfo)) ;
                    }
                    cb(err) ;
                }) ;
            } // create_new_wallet

            function init_wallet(wallet_id, wallet_password, cb) {
                var pgm = service + '.init_wallet: ';
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing');
                init_api_client();
                api_client.initWallet(
                    {identifier: wallet_id, passphrase: wallet_password},
                    function (err, wallet, primaryMnemonic, backupMnemonic, blocktrailPubKeys) {
                        if (!err) {
                            bitcoin_wallet = wallet;
                            bitcoin_wallet_backup_info = null;
                        }
                        cb(err);
                    }).then(
                    function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                        cb(null);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    }
                );
            } // init_wallet

            function delete_wallet (cb) {
                if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
                bitcoin_wallet.deleteWallet(function (error, success) {
                    if (success) {
                        bitcoin_wallet = null ;
                        cb(null);
                    }
                    else cb('Could not delete wallet. error = ' + JSON.stringify(error)) ;
                }) ;
            } // delete_wallet

            // export
            return {
                generate_random_string: generate_random_string,
                get_wallet_status: get_wallet_status,
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                delete_wallet: delete_wallet
            };

            // end MoneyNetworkW2Service
        }])

;
