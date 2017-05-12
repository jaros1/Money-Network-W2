
angular.module('MoneyNetworkW2')

    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
            var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;
            var api_client, bitcoin_wallet, bitcoin_wallet_backup_info, bitcoin_wallet_confirmed_balance, bitcoin_wallet_unconfirmed_balance ;

            var wallet_info = {
                status: 'n/a',
                confirmed_balance: null,
                unconfirmed_balance: null
            } ;
            function get_wallet_info () {
                return wallet_info ;
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

            function get_wallet_balance (cb) {
                bitcoin_wallet.getBalance(
                    function(err, confirmedBalance, unconfirmedBalance) {
                        if (err) return cb(err) ;
                        wallet_info.confirmed_balance = blocktrail.toBTC(confirmedBalance) ;
                        // console.log('Balance: ', wallet_info.confirmed_balance);
                        wallet_info.unconfirmed_balance = blocktrail.toBTC(unconfirmedBalance) ;
                        // console.log('Unconfirmed Balance: ', wallet_info.unconfirmed_balance);
                        cb(null) ;
                    }
                );
            }

            function create_new_wallet (wallet_id, wallet_password, cb) {
                var pgm = service + '.create_new_wallet: ' ;
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing') ;
                init_api_client() ;
                api_client.createNewWallet(wallet_id, wallet_password, function (err, wallet, backupInfo) {
                    if (err) return ;
                    bitcoin_wallet = wallet ;
                    bitcoin_wallet_backup_info = backupInfo ;
                    console.log('Backup info = ' + CircularJSON.stringify(backupInfo)) ;
                    wallet_info.status = 'Open' ;
                    get_wallet_balance(cb) ;
                }).then(
                    function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    }
                ) ;
            } // create_new_wallet

            function init_wallet(wallet_id, wallet_password, cb) {
                var pgm = service + '.init_wallet: ';
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing');
                init_api_client();
                api_client.initWallet(
                    {identifier: wallet_id, passphrase: wallet_password},
                    function (err, wallet, primaryMnemonic, backupMnemonic, blocktrailPubKeys) {
                        if (err) return;
                        bitcoin_wallet = wallet;
                        bitcoin_wallet_backup_info = null;
                        wallet_info.status = 'Open';
                        get_wallet_balance(cb);
                    }).then(
                    function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    }
                );
            } // init_wallet

            function close_wallet (cb) {
                if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
                bitcoin_wallet = null ;
                bitcoin_wallet_backup_info = null ;
                wallet_info.status = 'n/a' ;
                wallet_info.confirmed_balance = null ;
                wallet_info.unconfirmed_balance = null ;
                cb(null) ;
            } // close_wallet

            function delete_wallet (cb) {
                if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
                // confirm operation!
                ZeroFrame.cmd("wrapperConfirm", ["Delele wallet?", "OK"], function (confirm) {
                    if (!confirm) return cb('Wallet was not deleted')  ;
                    // delete wallet
                    bitcoin_wallet.deleteWallet(function (error, success) {
                        if (success) {
                            bitcoin_wallet = null ;
                            wallet_info.status = 'n/a' ;
                            wallet_info.confirmed_balance = null ;
                            wallet_info.unconfirmed_balance = null ;
                            cb(null);
                        }
                        else cb('Could not delete wallet. error = ' + JSON.stringify(error)) ;
                    }) ;
                }) ;

            } // delete_wallet


            function get_new_address (cb) {
                var pgm = service + '.get_new_address: ' ;
                if (!bitcoin_wallet) return cb('No bitcoin wallet found') ;
                bitcoin_wallet.getNewAddress(cb)
                    .then(function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    });
            } // get_new_address

            function send_money (address, amount, cb) {
                var pgm = service + '.send_money: ' ;
                var satoshi = parseInt(amount) ;
                var btc = satoshi / 100000000 ;
                ZeroFrame.cmd("wrapperConfirm", ["Send " + satoshi + ' satoshi = ' + btc + ' tBTC<br>to ' + address +"?", "OK"], function (confirm) {
                    if (!confirm) return cb('Money was not sent') ;
                    var payment = {} ;
                    payment[address] = satoshi ;
                    bitcoin_wallet.pay(payment, null, false, true, blocktrail.Wallet.FEE_STRATEGY_BASE_FEE, cb) ;
                }) ;


            } // send_money

            // export
            return {
                generate_random_string: generate_random_string,
                get_wallet_info: get_wallet_info,
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                get_balance: get_wallet_balance,
                close_wallet: close_wallet,
                delete_wallet: delete_wallet,
                get_new_address: get_new_address,
                send_money: send_money
            };

            // end MoneyNetworkW2Service
        }])

;
