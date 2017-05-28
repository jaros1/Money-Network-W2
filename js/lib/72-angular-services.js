
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

            function user_path () {
                var pgm = service + '.user_path: ' ;
                if (!ZeroFrame.site_info) throw pgm + "invalid call. ZeroFrame is not finish loading" ;
                if (!ZeroFrame.site_info.auth_address) throw pgm + "invalid call. ZeroId is missing" ;
                return 'merged-MoneyNetwork/1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ/data/users/' + ZeroFrame.site_info.auth_address + '/' ;
            }

            var z_cache = {} ; // cache: wallet.json

            var z_publish_interval = 0 ;
            function z_publish (cb) {
                var pgm = service + '.z_publish: ' ;
                var inner_path ;
                if (!cb) cb = function () {} ;
                // sitePublish
                inner_path = user_path() + 'content.json' ;
                console.log(pgm + 'publishing ' + inner_path) ;
                ZeroFrame.cmd("sitePublish", {inner_path: inner_path}, function (res) {
                    var pgm = service + '.z_publish sitePublish callback 1: ';
                    console.log(pgm + 'res = ' + res) ;
                    if (res != "ok") {
                        ZeroFrame.cmd("wrapperNotification", ["error", "Failed to publish: " + res.error, 5000]);
                        // error - repeat sitePublish in 30, 60, 120, 240 etc seconds (device maybe offline or no peers)
                        if (!z_publish_interval) z_publish_interval = 30;
                        else z_publish_interval = z_publish_interval * 2;
                        console.log(pgm + 'Error. Failed to publish: ' + res.error + '. Try again in ' + z_publish_interval + ' seconds');
                        var retry_zeronet_site_publish = function () {
                            z_publish();
                        };
                        if (cb) cb(res.error);
                        $timeout(retry_zeronet_site_publish, zeronet_site_publish_interval * 1000);
                        // debug_info() ;
                        return;
                    }

                    // sitePublish OK
                    z_publish_interval = 0;
                    cb(null);

                }) ; // sitePublish callback 1)

            } // z_publish

            var get_wallet_json_cbs = [] ; // callbacks waiting for first get_wallet_json request to finish
            function get_wallet_json (cb) {
                var pgm = service + '.get_wallet_json: ' ;
                var inner_path ;
                if (z_cache.wallet_json == true) return get_wallet_json_cbs.push(cb) ; // wait for first get_wallet_json request to finish
                if (z_cache.wallet_json) return cb(z_cache.wallet_json) ; // wallet.json is already in cache
                z_cache.wallet_json = true ;
                inner_path = user_path() + 'wallet.json' ;
                ZeroFrame.cmd("fileGet", {inner_path: inner_path, required: false}, function (wallet_str) {
                    var wallet ;
                    if (!wallet_str) wallet = {} ;
                    else wallet = JSON.parse(wallet_str) ;
                    z_cache.wallet_json = wallet ;
                    cb(z_cache.wallet_json) ;
                    while (get_wallet_json_cbs.length) { cb = get_wallet_json_cbs.shift() ; cb(z_cache.wallet_json)} ;
                }) ; // fileGet callback 1
            } // get_wallet_json

            function write_wallet_json(cb) {
                var pgm = service + '.write_wallet_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.wallet_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                inner_path = user_path() + 'wallet.json' ;
                console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                ZeroFrame.cmd("fileWrite", [inner_path, btoa(json_raw)], function (res) {
                    var pgm = service + '.write_wallet_json fileWrite callback 1: ';
                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    cb(res);
                }); // fileWrite callback 1
            } // write_wallet_json

            // save pubkey2 (cryptMessage public key in wallet.json for encrypted communication
            var session_at = new Date().getTime() ;
            function save_pubkey2 (cb) {
                var pgm = service + '.save_pubkey2: ' ;
                if (!cb) cb = function() {} ;
                if (!sessionid) return cb('No session. wallet.json was not updated') ;
                get_wallet_json(function (wallet) {
                    var pgm = service + '.save_pubkey2 get_wallet_json callback 1: ' ;
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet)) ;
                    ZeroFrame.cmd("userPublickey", [0], function (pubkey2) {
                        var pgm = service + '.save_pubkey2 userPublickey callback 2: ' ;
                        console.log(pgm + 'pubkey2 = ' + JSON.stringify(pubkey2)) ;
                        // if (wallet.pubkey2 == pubkey2) return cb(null) ;
                        wallet.session_at = session_at ;
                        wallet.sessionid_sha256 = CryptoJS.SHA256(sessionid).toString();
                        wallet.pubkey2 = pubkey2 ;
                        write_wallet_json(function (res) {
                            console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                            if (res == "ok") z_publish(cb) ;
                            else cb(res) ;
                        }) ;
                    }) ; // userPublickey callback 2
                }) ; // get_wallet callback 1
            } // save_wallet

            // money network session. only relevant if wallet is called from MoneyNetwork with a sessionid
            var sessionid ;
            function is_new_session () {
                var pgm = service + '.is_new_session: ' ;
                var new_sessionid, a_path, z_path ;
                if (sessionid) return false ; // continue old session
                new_sessionid = $location.search()['sessionid'] ;
                if (!new_sessionid) return false ; // no session
                // new session. save and redirect without sessionid
                sessionid = new_sessionid ;
                console.log(pgm + 'saved new sessionid = ' + sessionid) ;
                a_path = '/wallet' ;
                z_path = "?path=" + a_path ;
                $location.path(a_path).search({sessionid:null}) ;
                $location.replace();
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Money Network W2", z_path]) ;
                // console.log(pgm + 'login with a deep link: a_path = ' + a_path + ', z_path = ' + z_path) ;
                return true;
            } // is_new_session
            function get_sessionid () {
                return sessionid ;
            }

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
                send_money: send_money,
                is_new_session: is_new_session,
                get_sessionid: get_sessionid,
                save_pubkey2: save_pubkey2
            };

            // end MoneyNetworkW2Service
        }])

;
