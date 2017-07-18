angular.module('MoneyNetworkW2')

    // btcService and MoneyNetworkW2Service
    // abbreviations:
    // - MN - MoneyNetwork - main site
    // - W2 - MoneyNetworkW2 - plugin wallet site with test bitcoins

    .factory('btcService', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            // https://www.blocktrail.com/api/docs ==>

            var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
            var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;
            var api_client, bitcoin_wallet, bitcoin_wallet_backup_info ;

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
                    testnet: true // test Bitcoins
                });
                return api_client ;
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

            // get_new_address (receive money)
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

            // <== https://www.blocktrail.com/api/docs





            // export
            return {
                get_wallet_info: get_wallet_info,
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                get_balance: get_wallet_balance,
                close_wallet: close_wallet,
                delete_wallet: delete_wallet,
                get_new_address: get_new_address,
                send_money: send_money
            };

            // end btcService
        }])


    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            // localStorage wrapper. avoid some ZeroNet callbacks. cache localStorage in ls hash
            var ls = { is_loading: true } ;
            function ls_load() {
                ZeroFrame.cmd("wrapperGetLocalStorage", [], function (res) {
                    var pgm = service + '.wrapperGetLocalStorage callback: ';
                    var key, cb ;
                    // console.log(pgm + 'typeof res =' + typeof res) ;
                    // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    if (!res) res = [{}] ;
                    res = res[0];
                    // moving values received from ZeroFrame API to JS copy of local storage
                    ls_loaded(res) ;
                }) ;
            } // ls_load
            ls_load() ;

            // localStorage loaded
            function ls_loaded(res) {
                // is siteInfo ready?
                var wait_for_site_info, key, cb ;
                wait_for_site_info = function() { ls_loaded(res) };
                if (!ZeroFrame.site_info) {
                    $timeout(wait_for_site_info, 500) ;
                    return ;
                }
                // siteInfo is ready
                for (key in res) ls[key] = res[key] ;
                delete ls.is_loading ;
                // run callbacks waiting for ls and site_info to be ready. see ls_bind
                while (ls_cbs.length) {
                    cb = ls_cbs.shift() ;
                    cb() ;
                }
            } // ls_loaded

            var ls_cbs = [] ; // any callbacks waiting for ls finish loading?
            function ls_bind(cb) {
                if (ls.is_loading) ls_cbs.push(cb) ;
                else cb() ;
            }

            function ls_get () { return ls }
            function ls_save() {
                ZeroFrame.cmd("wrapperSetLocalStorage", [ls], function () {}) ;
            } // ls_save


            // setup MoneyNetworkAPI
            // MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f]{10}.[0-9]{13}$"}) ; // global options
            MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]$"}) ; // global options

            var encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ; // encrypt1. no sessionid. self encrypt/decrypt data in W2 localStorage ;

            // save_wallet_login:
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function get_wallet_login(save_wallet_login, cb) {
                var pgm = service + '.get_wallet_login: ' ;
                var error, cert_user_id, encrypted_json, request ;
                if (['1','2'].indexOf(save_wallet_login) == -1) return cb(null, null, "Invalid call. save_wallet_login must be equal '1' or '2'") ;
                if (save_wallet_login == '1') {
                    // wallet login is saved encrypted (cryptMessage) in W2 localStorage
                    if (!ls.wallet_login) return cb(null, null, 'wallet_login hash was not found in localStorage') ;
                    if (typeof ls.wallet_login != 'object') {
                        error = 'wallet_login is not a hash. wallet_login = ' + JSON.stringify(ls.wallet_login) ;
                        ls.wallet_login = {} ;
                        return cb(null, null, error) ;
                    }
                    cert_user_id = ZeroFrame.site_info.cert_user_id || 'n/a' ;
                    encrypted_json = ls.wallet_login[cert_user_id] ;
                    if (!encrypted_json) return cb(null, null, 'Wallet login for ' + cert_user_id + ' was not found') ;
                    console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                    encrypt1.decrypt_json(encrypted_json, function(json) {
                        var pgm = service + '.get_wallet_login decrypt_json callback: ' ;
                        console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                        if (!json) cb(null, null, 'decrypt error. encrypted_json was ' + JSON.stringify(encrypted_json)) ;
                        else cb(json.wallet_id, json.wallet_password, null) ;
                    }) ; // decrypt_json callback
                }
                else {
                    // save_wallet_login == '2'
                    // wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
                    if (!status.sessionid) return cb(null, null, 'Cannot read wallet information. MN session was not found');
                    // send get_data message to MN and wait for response
                    request = { msgtype: 'get_data', keys: ['login'] } ;
                    console.log(pgm + 'sending get_data request to MN. request = ' + JSON.stringify(request)) ;
                    encrypt2.send_message(request, {response: true}, function (response) {
                        var pgm = service + '.get_wallet_login send_message callback: ' ;
                        var encrypted_data, data, decrypt_row ;
                        if (response.error) return cb(null, null, response.error) ;
                        console.log(pgm + 'response = ' + JSON.stringify(response));
                        // response.data - array with 0-n rows with encrypted data. decrypt 0-n data rows
                        encrypted_data = response.data ;
                        data = [] ;
                        decrypt_row = function(cb2) {
                            var pgm = service + '.get_wallet_login.decrypt_row: ' ;
                            var encrypted_row, encrypted_json ;
                            if (encrypted_data.length == 0) return cb2() ;
                            encrypted_row = encrypted_data.shift() ;
                            console.log(pgm + 'encrypted_row = ' + JSON.stringify(encrypted_row)) ;
                            encrypted_json = JSON.parse(encrypted_row.value) ;
                            encrypt1.decrypt_json(encrypted_json, function (decrypted_json) {
                                var pgm = service + '.get_wallet_login.decrypt_row decrypt_json callback: ' ;
                                var decrypted_row ;
                                decrypted_row = {key: encrypted_row.key, value: decrypted_json} ;
                                console.log(pgm + 'decrypted_row = ' + JSON.stringify(decrypted_row));
                                data.push(decrypted_row) ;
                                decrypt_row(cb2) ;
                            }) ; // decrypt_json callback 1
                        };
                        decrypt_row(function() {
                            var pgm = service + '.get_wallet_login decrypt_row callback: ' ;
                            response.data = data ;
                            if ((response.data.length != 1) || (response.data[0].key != 'login')) {
                                console.log(pgm + 'error. expected one row with login info to be returned in data array. response to get_data message was ' + JSON.stringify(response));
                                return cb(null, null, 'Error. Wallet login info was not returned from MN') ;
                            }
                            // OK. received wallet login from MN
                            console.log(pgm + 'data[0] = ' + JSON.stringify(data[0])) ;
                            // data[0] = {"key":"login","value":{"wallet_id":"UZGToFfXOz7GKCogsOOuxJYndjcmt2","wallet_password":"bGaGK/+w(Qm4Wi}fAyz:CcgxWuen)F"}}
                            cb(data[0].value.wallet_id, data[0].value.wallet_password, null);
                        }) ;

                        //encrypt1.decrypt(encrypted_data, function (data) {
                        //    if (!data) cb({error: 'decrypt get_data response failed'}) ;
                        //    else if (data.error) cb({error: 'get_data request failed. ' + data.error}) ;
                        //    else cb({wallet_id: data.wallet_id, wallet_password: data.wallet_password}) ;
                        //}) ; // decrypt callback

                    }) ; // send_message callback
                }
            } // get_wallet_login


            // save_wallet_login:
            // - '0': no thank you. Clear any wallet data previously saved with '1' or '2'
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function save_wallet_login(save_wallet_login, wallet_id, wallet_password, cb) {
                var pgm = service + '.save_wallet_login: ';
                var cert_user_id, data, request, old_login, save_w2;
                if (['0', '1', '2'].indexOf(save_wallet_login) == -1) return cb({error: "Invalid call. save_wallet_login must be equal '0', '1' or '2'"});

                // update W2 localStorage
                cert_user_id = ZeroFrame.site_info.cert_user_id || 'n/a';
                if (!ls.save_login) ls.save_login = {};
                if (!ls.save_login[cert_user_id]) ls.save_login[cert_user_id] = {};
                old_login = JSON.parse(JSON.stringify(ls.save_login[cert_user_id]));
                ls.save_login[cert_user_id].choice = save_wallet_login;

                // get and add W2 pubkey2 to encryption setup (self encrypt using ZeroNet certificate)
                get_my_pubkey2(function (my_pubkey2) {
                    var pgm = service + '.save_wallet_login get_my_pubkey2 callback 1: ';
                    var save_w2;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2});

                    // save in W2 localStorage (choice '0' and '1')
                    save_w2 = function (cb) {
                        var pgm = service + '.save_wallet_login.save_w2: ';
                        var unencrypted_login;
                        if (save_wallet_login != '1') {
                            // delete any old login info from W2 localStorage
                            delete ls.save_login[cert_user_id].login;
                            ls_save();
                            return cb();
                        }
                        // save login info in W2 localStorage
                        if (cert_user_id == 'n/a') {
                            // no cert_user_id. not encrypted
                            ls.save_login[cert_user_id].login = {
                                wallet_id: wallet_id,
                                wallet_password: wallet_password
                            };
                            ls_save();
                            return cb();
                        }
                        // cert_user_id: encrypt login
                        unencrypted_login = {wallet_id: wallet_id, wallet_password: wallet_password};
                        console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);
                        encrypt1.encrypt_json(unencrypted_login, [2], function (encrypted_login) {
                            ls.save_login[cert_user_id].login = encrypted_login;
                            ls_save();
                            return cb();
                        });
                    }; // save_w2

                    save_w2(function () {
                        var pgm = service + '.save_wallet_login save_w2 callback 2: ';
                        // update MN localStorage (choice '2')
                        if (save_wallet_login == '2') {
                            if (!status.sessionid) {
                                ls.save_login[cert_user_id] = old_login;
                                return cb({error: 'Error. Cannot save wallet information in MN. MN session was not found'});
                            }
                            // encrypt wallet data before sending data to MN
                            data = {wallet_id: wallet_id, wallet_password: wallet_password};
                            console.log(pgm + 'data = ' + JSON.stringify(data));
                            // cryptMessage encrypt data with current ZeroId before sending data to MN.
                            // encrypt data before send save_data message
                            encrypt1.encrypt_json(data, [2], function (encrypted_data) {
                                var pgm = service + '.save_wallet_login encrypt_json callback 3: ';
                                var request;
                                console.log(pgm + 'data (encrypted) = ' + JSON.stringify(encrypted_data));
                                // send encrypted wallet data to MN and wait for response
                                request = {
                                    msgtype: 'save_data',
                                    data: [{key: 'login', value: JSON.stringify(encrypted_data)}]
                                };
                                console.log(pgm + 'json = ' + JSON.stringify(request));
                                encrypt2.send_message(request, {response: true}, function (response) {
                                    var pgm = service + '.save_wallet_login send_message callback 4: ';
                                    if (!response) cb({error: 'No response'});
                                    else if (response.error) cb({error: response.error});
                                    else {
                                        // OK. saved
                                        if (!ls.save_login) ls.save_login = {};
                                        ls.save_login[cert_user_id] = save_wallet_login;
                                        ls_save();
                                        cb({});
                                    }
                                }); // send_message callback 4
                            }); // encrypt_json callback 3

                        }
                        else {
                            // 0 or 1. clear old 2
                            if (!status.sessionid) return cb({error: 'Cannot clear wallet information. MN session was not found'});
                            // send data_delete to MN session
                            request = {msgtype: 'delete_data'}; // no keys array. delete all data for session
                            console.log(pgm + 'json = ' + JSON.stringify(request));
                            encrypt2.send_message(request, {response: true}, function (response) {
                                var pgm = service + '.save_wallet_login send_message callback 1: ';
                                if (!response) cb({error: 'No response'});
                                else if (response.error) cb({error: response.error});
                                else cb({});
                            }); // send_message callback 1
                        }

                    }); // save_w2 callback 2

                }); // get_my_pubkey2 callback 1

            } // save_wallet_login

            // todo: changed ZeroId. clear z_cache.
            var z_cache = {} ; // cache some ZeroNet objects: user_hub, wallet.json

            function get_default_user_hub () {
                var pgm = service + '.get_default_user_hub: ' ;
                var default_user_hub, default_hubs, hub, hubs, i ;
                default_user_hub = '1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ' ;
                console.log(pgm + 'ZeroFrame.site_info.content = ' + JSON.stringify(ZeroFrame.site_info.content));
                default_hubs = ZeroFrame.site_info.content.settings.default_hubs ;
                if (!default_hubs) return default_user_hub ;
                hubs = [] ;
                for (hub in default_hubs) hubs.push(hub) ;
                if (!hubs.length) return default_user_hub ;
                i = Math.floor(Math.random() * hubs.length);
                return hubs[i] ;
            } // get_default_user_hub3


            var get_my_user_hub_cbs = [] ; // callbacks waiting for query 17 to finish
            function get_my_user_hub (cb) {
                var pgm = service + '.get_my_hub: ' ;
                if (z_cache.my_user_hub == true) {
                    // get_my_user_hub request is already running. please wait
                    get_my_user_hub_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.my_user_hub) return cb(z_cache.my_user_hub) ;
                z_cache.my_user_hub = true ;

                // get a list of MN wallet data hubs
                // ( MN merger sites with title starting with "W2 ")
                ZeroFrame.cmd("mergerSiteList", [true], function (merger_sites) {
                    var pgm = service + '.get_my_hub mergerSiteList callback 1: ' ;
                    var wallet_data_hubs, hub, query, debug_seq, i ;
                    wallet_data_hubs = [] ;
                    if (!merger_sites || merger_sites.error) console.log(pgm + 'mergerSiteList failed. merger_sites = ' + JSON.stringify(merger_sites)) ;
                    else for (hub in merger_sites) {
                        if (merger_sites[hub].content.title.match(/^W2 /i)) wallet_data_hubs.push(hub);
                    }
                    console.log(pgm + 'wallet_data_hubs = ' + JSON.stringify(wallet_data_hubs));
                    // user_data_hubs = ["1PgyTnnACGd1XRdpfiDihgKwYRRnzgz2zh","1922ZMkwZdFjKbSAdFR1zA5YBHMsZC51uc"]

                    // find wallet data hub for current user
                    // - wallet.json file most exist
                    // - wallet.wallet_address = this site
                    // - latest updated content.json is being used
                    query =
                        "select substr(wallet_json.directory, 1, instr(wallet_json.directory,'/')-1) as hub " +
                        "from keyvalue as wallet_address, json as wallet_json, json as content_json, keyvalue as modified " +
                        "where wallet_address.key = 'wallet_address' " +
                        "and wallet_address.value = '" + ZeroFrame.site_info.address + "' " +
                        "and wallet_json.json_id = wallet_address.json_id " +
                        "and wallet_json.directory like '%/" + ZeroFrame.site_info.auth_address + "' " +
                        "and content_json.directory = wallet_json.directory " +
                        "and content_json.file_name = 'content.json' " +
                        "and modified.json_id = content_json.json_id " +
                        "and modified.key = 'modified' " +
                        "order by modified.value desc" ;

                    console.log(pgm + 'query 17 (MS OK) = ' + query);
                    ZeroFrame.cmd("dbQuery", [query], function (res) {
                        var pgm = service + '.get_my_hub dbQuery callback 2: ' ;
                        var i ;
                        var execute_pending_callbacks = function () {
                            while (get_my_user_hub_cbs.length) { cb = get_my_user_hub_cbs.shift() ; cb(z_cache.my_user_hub)} ;
                        };
                        if (res.error) {
                            console.log(pgm + "user data hub lookup failed: " + res.error);
                            console.log(pgm + 'query = ' + query);
                            z_cache.my_user_hub = get_default_user_hub() ;
                            cb(z_cache.my_user_hub) ;
                            return;
                        }
                        if (res.length) {
                            // old user
                            z_cache.my_user_hub = res[0].hub ; // return hub for last updated content.json
                            console.log(pgm + 'hub = ' + z_cache.my_user_hub) ;
                            cb(z_cache.my_user_hub) ;
                            execute_pending_callbacks() ;
                            return ;
                        }
                        // new user. get user data hub from
                        // 1) list of MN merger sites (mergerSiteList)
                        // 2) default_hubs from site_info.content.sessions.default_hubs
                        if (wallet_data_hubs.length) {
                            i = Math.floor(Math.random() * wallet_data_hubs.length);
                            z_cache.my_user_hub = wallet_data_hubs[i] ;
                        }
                        else z_cache.my_user_hub = get_default_user_hub() ;
                        console.log(pgm + 'hub = ' + z_cache.my_user_hub) ;
                        cb(z_cache.my_user_hub) ;
                        execute_pending_callbacks() ;
                    }) ; // dbQuery callback 2

                }) ; // mergerSiteList callback 1

            } // get_my_user_hub

            var get_user_path_cbs = [] ;
            function get_user_path (cb) {
                var pgm = service + '.user_path: ' ;
                if (!ZeroFrame.site_info) throw pgm + "invalid call. ZeroFrame is not finish loading" ;
                // if (!ZeroFrame.site_info.cert_user_id) throw pgm + "invalid call. ZeroId is missing" ;
                if (z_cache.user_path == true) {
                    // wait for previous user_path request to finish
                    get_user_path_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.user_path) return cb(z_cache.user_path) ; // OK
                z_cache.user_path = true ;
                get_my_user_hub(function (my_hub) {
                    z_cache.user_path = 'merged-MoneyNetwork/' + my_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' ;
                    MoneyNetworkAPILib.config({this_user_path: z_cache.user_path}) ;
                    cb(z_cache.user_path);
                    while (get_user_path_cbs.length) { cb = get_user_path_cbs.shift() ; cb(z_cache.user_path)}
                }) ;
            } // get_user_path

            // todo: 3) publish only if wallet.json content has been created/updated/deleted
            var z_publish_interval = 0 ;
            function z_publish (cb) {
                var pgm = service + '.z_publish: ' ;
                var inner_path ;
                if (!cb) cb = function () {} ;
                // get full merger site user path
                get_user_path(function (user_path) {
                    inner_path = user_path + 'content.json' ;
                    console.log(pgm + 'publishing ' + inner_path) ;
                    // content.json file must have optional files support
                    encrypt1.add_optional_files_support(function() {
                        // sitePublish
                        console.log(pgm + inner_path + ' siteSign start') ;
                        ZeroFrame.cmd("sitePublish", {inner_path: inner_path}, function (res) {
                            var pgm = service + '.z_publish siteSign callback 3: ';
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
                                $timeout(retry_zeronet_site_publish, z_publish_interval * 1000);
                                // debug_info() ;
                                return cb(false);
                            }

                            // sitePublish OK
                            z_publish_interval = 0;
                            cb(true);

                        }) ; // sitePublish callback 3

                    }) ; // add_optional_files_support callback 2

                }) ; // get_user_path callback 1

            } // z_publish

            var get_content_json_cbs = [] ; // callbacks waiting for first get_content_json request to finish
            function get_content_json (cb) {
                var pgm = service + '.get_content_json: ' ;
                if (z_cache.content_json == true) return get_content_json_cbs.push(cb) ; // wait for first get_content_json request to finish
                if (z_cache.content_json) return cb(z_cache.content_json) ; // wallet.json is already in cache
                z_cache.content_json = true ;
                get_user_path(function (user_path) {
                    var inner_path ;
                    inner_path = user_path + 'content.json' ;
                    ZeroFrame.cmd("fileGet", {inner_path: inner_path, required: false}, function (content_str) {
                        var content ;
                        if (!content_str) content = {} ;
                        else content = JSON.parse(content_str) ;
                        z_cache.content_json = content ;
                        cb(z_cache.content_json) ;
                        while (get_content_json_cbs.length) { cb = get_content_json_cbs.shift() ; cb(z_cache.content_json)} ;
                    }) ; // fileGet callback 2
                }) ; // get_user_path callback 1
            } // get_content_json

            function write_content_json(cb) {
                var pgm = service + '.write_content_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.content_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_content_json get_user_path callback 1: ';
                    var inner_path ;
                    inner_path = user_path + 'content.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    ZeroFrame.cmd("fileWrite", [inner_path, btoa(json_raw)], function (res) {
                        var pgm = service + '.write_content_json fileWrite callback 2: ';
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        cb(res);
                    }); // fileWrite callback 2
                }) ; // get_user_path callback 2
            } // write_content_json

            var get_wallet_json_cbs = [] ; // callbacks waiting for first get_wallet_json request to finish
            function get_wallet_json (cb) {
                var pgm = service + '.get_wallet_json: ' ;
                if (z_cache.wallet_json == true) return get_wallet_json_cbs.push(cb) ; // wait for first get_wallet_json request to finish
                if (z_cache.wallet_json) return cb(z_cache.wallet_json) ; // wallet.json is already in cache
                z_cache.wallet_json = true ;
                get_user_path(function (user_path) {
                    var inner_path ;
                    inner_path = user_path + 'wallet.json' ;
                    ZeroFrame.cmd("fileGet", {inner_path: inner_path, required: false}, function (wallet_str) {
                        var wallet ;
                        if (!wallet_str) wallet = {} ;
                        else wallet = JSON.parse(wallet_str) ;
                        z_cache.wallet_json = wallet ;
                        cb(z_cache.wallet_json) ;
                        while (get_wallet_json_cbs.length) { cb = get_wallet_json_cbs.shift() ; cb(z_cache.wallet_json)} ;
                    }) ; // fileGet callback 2
                }) ; // get_user_path callback 1
            } // get_wallet_json

            function write_wallet_json(cb) {
                var pgm = service + '.write_wallet_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.wallet_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_wallet_json get_user_path callback 1: ';
                    var inner_path ;
                    inner_path = user_path + 'wallet.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    ZeroFrame.cmd("fileWrite", [inner_path, btoa(json_raw)], function (res) {
                        var pgm = service + '.write_wallet_json fileWrite callback 2: ';
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        cb(res);
                    }); // fileWrite callback 2
                }) ; // get_user_path callback 2
            } // write_wallet_json

            // save pubkey2 (cryptMessage public key in wallet.json for encrypted communication
            // todo: 1) use wallet for public information (wallet_address, wallet_title, wallet_description)
            // todo: 2) use optional file for session data (session_at, sessionid_sha256, pubkey2)
            // todo: 3) add optional
            var session_at = new Date().getTime() ;

            function update_wallet_json(cb) {
                var pgm = service + '.update_wallet_json: ';
                if (!cb) cb = function () {};
                get_wallet_json(function (wallet) {
                    var pgm = service + '.create_session get_wallet_json callback 1: ';
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                    var old_wallet_str = JSON.stringify(wallet) ;
                    // todo: add hub = random other W2 user data hub. For list of available W2 user data hubs. See https://github.com/jaros1/Money-Network-W2/issues/2
                    wallet.wallet_address = ZeroFrame.site_info.address;
                    wallet.wallet_title = ZeroFrame.site_info.content.title;
                    wallet.wallet_description = ZeroFrame.site_info.content.description;
                    if (old_wallet_str == JSON.stringify(wallet)) return cb('ok'); // no change to public wallet information
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                    write_wallet_json(function (res) {
                        console.log(pgm + 'res = ' + JSON.stringify(res));
                        if (res == "ok") z_publish(cb);
                        else cb(res);
                    }); // write_wallet_json callback 2
                }); // get_wallet_json callback 1
            } // update_wallet_json

            // MN-W2 session. only relevant if W2 is called from MN with a sessionid or an old still working MN-W2 session can be found in localStorage
            // session status: use at startup and after changing/selecting ZeroId
            var status = {
                sessionid: null,
                merger_permission: 'n/a', // checking Merger:MoneyNetwork permission
                session_handshake: 'n/a', // checking old/new session
                save_login: '0', // radio group '0', '1' (W2 LS) or '2' (MN LS)
                save_login_disabled: true // radio group disabled while checking save_wallet_login status
            } ;
            function get_status () { return status }

            // listen for incoming messages from MN. called from MoneyNetworkAPILib.demon
            // params:
            // - inner_path: inner_path to new incoming message
            // - encrypt2: instance of MoneyNetworkAPI class created with new MoneyNetworkAPI request
            function process_incoming_message (inner_path, encrypt2) {
                var pgm = service + '.process_incoming_message: ';
                console.log(pgm + 'inner_path = ' + inner_path);
                ZeroFrame.cmd("fileGet", {inner_path: inner_path, required: false}, function (json_str) {
                    var pgm = service + '.process_incoming_message fileGet callback 1: ';
                    var encrypted_json ;
                    if (!json_str) {
                        console.log(pgm + 'fileGet ' + inner_path + ' failed') ;
                        return ;
                    }
                    encrypted_json = JSON.parse(json_str) ;
                    // decrypt json
                    encrypt2.decrypt_json(encrypted_json, function (json) {
                        var pgm = service + '.process_incoming_message decrypt_json callback 2: ';
                        var error ;
                        console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                        console.log(pgm + 'todo: not implemented') ;

                    }) ; // decrypt_json callback 2
                }); // fileGet callback 1
            } // process_incoming_message

            // encrypt2 - encrypt messages between MN and W2
            // todo: reset encrypt1 and encrypt2 when cert_user_id is set or changed
            var encrypt2 = new MoneyNetworkAPI({
                debug: 'encrypt2',
                cb: process_incoming_message
            }) ;
            var new_sessionid; // temporary save sessionid received from MN
            var sessionid ; // unique sessionid. also like a password known only by MN and W2 session
            var this_pubkey ;            // W2 JSEncrypt public key used by MN
            var this_pubkey2 ;           // W2 cryptMessage public key used by MN

            // session is saved in localStorage and session information is encrypted with a session password
            // session password = pwd1+pwd2
            // pwd1 is saved in W2 localStorage and cryptMessage encrypted
            // pwd2 is saved in MN localStorage and is symmetric encrypted with pwd1
            // session password is not saved on ZeroNet and is not shared with other users on ZeroNet
            // session can be restored with ZeroNet cert + MN login
            var session_pwd1, session_pwd2 ;

            // read first "pubkeys" message from MN session
            // optional file with file format <other_session_filename>.<timestamp>
            // pubkey used by JSEncrypt (client) and pubkey2 used by cryptMessage (ZeroNet)
            function read_pubkeys (cb) {
                var pgm = service + '.read_pubkeys: ' ;
                if (!cb) cb = function() {} ;

                encrypt2.get_session_filenames(function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.read_pubkeys get_session_filenames callback 1: ' ;
                    var query ;
                    console.log(pgm + 'this_session_filename = ' + this_session_filename + ', other_session_filename = ' + other_session_filename) ;
                    query =
                        "select " +
                        "  json.directory," +
                        "  substr(json.directory, 1, instr(json.directory,'/')-1) as hub," +
                        "  substr(json.directory, instr(json.directory,'/data/users/')+12) as auth_address," +
                        "  files_optional.filename, keyvalue.value as modified " +
                        "from files_optional, json, keyvalue " +
                        "where files_optional.filename like '" + other_session_filename + ".%' " +
                        "and json.json_id = files_optional.json_id " +
                        "and keyvalue.json_id = json.json_id " +
                        "and keyvalue.key = 'modified' " +
                        "order by files_optional.filename desc" ;
                    console.log(pgm + 'query = ' + query) ;
                    ZeroFrame.cmd("dbQuery", [query], function (res) {
                        var pgm = service + '.read_pubkeys dbQuery callback 2: ' ;
                        var prefix, other_user_path, inner_path ;
                        prefix = "Error. MN-W2 session handshake failed. " ;
                        // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        if (res.error) {
                            console.log(pgm + prefix + 'cannot read pubkeys message. dbQuery failed with ' + res.error) ;
                            console.log(pgm + 'query = ' + query) ;
                            status.sessionid = null ;
                            return cb(status.sessionid) ;
                        }
                        if (res.length == 0) {
                            console.log(pgm + prefix + 'pubkeys message was not found') ;
                            console.log(pgm + 'query = ' + query) ;
                            status.sessionid = null ;
                            return cb(status.sessionid) ;
                        }

                        // mark file as read. generic process_incoming_message will not process this file
                        MoneyNetworkAPILib.wait_for_file({msgtype: 'n/a'}, res[0].filename) ;

                        // first message. remember path to other session user directory. all following messages must come from same user directory
                        other_user_path = 'merged-MoneyNetwork/' + res[0].directory + '/' ;
                        encrypt2.setup_encryption({other_user_path: other_user_path}) ;

                        // read file
                        inner_path = other_user_path + res[0].filename ;
                        // console.log(pgm +  inner_path + ' fileGet start') ;
                        ZeroFrame.cmd("fileGet", [inner_path, true], function (pubkeys_str) {
                            var pgm = service + '.read_pubkeys fileGet callback 3: ' ;
                            var pubkeys, now, content_signed, elapsed, error ;
                            // console.log(pgm + 'pubkeys_str = ' + pubkeys_str) ;
                            if (!pubkeys_str) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' was not found') ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            // check pubkeys message timestamps. must not be old or > now.
                            now = Math.floor(new Date().getTime()/1000) ;
                            content_signed = res[0].modified ;
                            // file_timestamp = Math.floor(parseInt(res[0].filename.substr(11))/1000) ;
                            elapsed = now - content_signed ;
                            if (elapsed < 0) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' signed in the future. elapsed = ' + elapsed) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            if (elapsed > 60) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' is too old. elapsed = ' + elapsed) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            // console.log(pgm + 'timestamps: file_timestamp = ' + file_timestamp + ', content_signed = ' + content_signed + ', now = ' + now) ;
                            pubkeys = JSON.parse(pubkeys_str) ;
                            error = encrypt2.validate_json(pgm, pubkeys) ;
                            if (error) {
                                console.log(pgm + prefix + 'invalid pubkeys message. error = ' + error) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            if (pubkeys.msgtype != 'pubkeys') {
                                console.log(pgm + prefix + 'First message from MN was NOT a pubkeys message. message = ' + JSON.stringify(pubkeys) );
                                status.sessionid = null ;
                                return cb(status.sessionid);
                            }
                            console.log(pgm + 'OK. received public keys from MN') ;
                            console.log(pgm + 'MN public keys: pubkey2 = ' + pubkeys.pubkey2 + ', pubkey = ' + pubkeys.pubkey) ;
                            console.log(pgm + 'todo: remember MN user_path. following messages must come from same MN user_path') ;
                            encrypt2.setup_encryption({pubkey: pubkeys.pubkey, pubkey2: pubkeys.pubkey2}) ;
                            // mark file as read.

                            // return W2 public keys to MN session for full end2end encryption between the 2 sessions
                            console.log(pgm + 'Return W2 public keys to MN for full end-2-end encryption') ;
                            write_pubkeys(cb) ;

                        }) ; // fileGet callback 3

                    }) ; // dbQuery callback 2


                }) ; // get_session_filenames callback 1

            } // read_pubkeys

            // get public key for JSEncrypt
            function get_my_pubkey () {
                var crypt, prvkey ;
                if (this_pubkey) return this_pubkey ;
                // generate key pair for client to client RSA encryption
                crypt = new JSEncrypt({default_key_size: 1024});
                crypt.getKey();
                this_pubkey = crypt.getPublicKey();
                prvkey = crypt.getPrivateKey();
                // save JSEncrypt private key for decrypt_1
                encrypt2.setup_encryption({prvkey: prvkey}) ;
                return this_pubkey ;
            } // get_my_pubkey

            // get public key for cryptMessage
            var get_my_pubkey2_cbs = [] ; // callbacks waiting for get_my_pubkey2 request
            function get_my_pubkey2 (cb) {
                var pgm = service + '.get_my_pubkey2: ' ;
                if (this_pubkey2 == true) { get_my_pubkey2_cbs.push(cb) ; return } // wait
                if (this_pubkey2) return cb(this_pubkey2) ; // ready
                // get pubkey2
                this_pubkey2 = true ;
                ZeroFrame.cmd("userPublickey", [0], function (my_pubkey2) {
                    var pgm = service + '.get_my_pubkey2 userPublickey callback: ' ;
                    this_pubkey2 = my_pubkey2 ;
                    console.log(pgm + 'encrypt1. setting pubkey2 = ' + my_pubkey2) ;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2}) ;
                    cb(this_pubkey2) ;
                    while (get_my_pubkey2_cbs.length) { cb = get_my_pubkey2_cbs.shift() ; cb(this_pubkey2) }
                }) ;
            } // get_my_pubkey2

            // pubkeys message from W2 to MN. public keys + a session password
            function write_pubkeys(cb) {
                var pgm = service + '.write_pubkeys: ' ;
                if (!cb) cb = function() {} ;
                // collect info before returning W2 public keys information to MN session
                get_user_path(function (user_path) {
                    var my_pubkey = get_my_pubkey() ;
                    get_my_pubkey2(function (my_pubkey2) {
                        encrypt2.add_optional_files_support(function() {
                            var pgm = service + '.write_pubkeys get_my_pubkey2 callback 3: ' ;
                            var request, encrypted_pwd2 ;
                            // W2 password
                            // - pwd1: cryptMessage encryped and saved in W2 localStorage
                            // - pwd2: encrypted with pwd1 and saved in MN.
                            session_pwd1 = generate_random_string(50, true) ;
                            session_pwd2 = generate_random_string(50, true) ;
                            encrypted_pwd2 = MoneyNetworkAPILib.aes_encrypt(session_pwd2, session_pwd1) ;
                            request = {
                                msgtype: 'pubkeys',
                                pubkey: my_pubkey, // for JSEncrypt
                                pubkey2: my_pubkey2, // for cryptMessage
                                password: encrypted_pwd2 // for session restore
                            } ;
                            console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                            encrypt2.send_message(request, {response: true, msgtype: 'pubkeys'}, function (response) {
                                var pgm = service + '.write_pubkeys send_message callback 4: ' ;
                                console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                                if (!response.error) {
                                    // session handshake ok. save session
                                    save_session(function() {cb(true) }) ;
                                }
                                else cb(false) ;
                            }) ; // send_message callback 4

                        }) ; // add_optional_files_support callback 3

                    }) ; // get_my_pubkey2 callback 2

                }) ; // get_user_path callback 1

            } // write_pubkeys

            // save session in W2 localStorage
            // - unencrypted:
            //   - W2 pubkey and W2 pubkey2
            //   - MN pubkey and MN pubkey2
            // - encrypted with cryptMessage (ZeroId)
            //   - session_pwd1, unlock_pwd2, this_session_filename, other_session_filename
            // - encrypted with session password
            //   - W2 prvkey
            //   - sessionid

            function save_session(cb) {
                var pgm = service + '.save_session: ' ;
                var array ;
                if (!cb) cb = function() {} ;
                encrypt2.get_session_filenames(function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.save_session get_session_filenames callback 1: ' ;

                    // cryptMessage encrypt session_pwd1, this_session_filename and other_session_filename
                    array = [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename] ;
                    encrypt1.encrypt_2(JSON.stringify(array), function(encrypted_info) {
                        var pgm = service + '.save_session encrypt_2 callback 2: ' ;
                        var cert_user_id, info, prvkey, password ;
                        if (!ls.sessions) ls.sessions = {} ;
                        cert_user_id = ZeroFrame.site_info.cert_user_id ;
                        if (!ls.sessions[cert_user_id]) ls.sessions[cert_user_id] = {} ;

                        info = ls.sessions[cert_user_id] ;
                        info.this_pubkey = this_pubkey ; // W2 (clear text)
                        info.this_pubkey2 = this_pubkey2 ; // W2 (clear text)
                        info.other_pubkey = encrypt2.other_session_pubkey ; // MN (clear text)
                        info.other_pubkey2 = encrypt2.other_session_pubkey2 ; // MN (clear text)
                        info.encrypted_info = encrypted_info ; // W2 (cryptMessage). pwd1, unlock_pwd2, this_session_filename and other_session_filename
                        prvkey = encrypt2.this_session_prvkey ;
                        password = session_pwd1 + session_pwd2 ;
                        info.prvkey = MoneyNetworkAPILib.aes_encrypt(prvkey, password) ; // W2 (symmetric encrypted)
                        info.sessionid = MoneyNetworkAPILib.aes_encrypt(status.sessionid, password); // MN+W2 (symmetric encrypted)
                        console.log(pgm + 'info = ' + JSON.stringify(info)) ;
                        //info = {
                        //    "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCZ6pQlnMMT/03KRipfc9/poCZl\nWq9nGpRrzfh5xJEuGkRPluTt4m92NJ6zqutZN4cxMPcfSuogoyqcG8ahb9I8VUXS\nslNDMNmpdk6WRI+ows0CtWJ3qGSJbTKMUAyoFE6plMJ6dCXH85vjLCocsUhEcSVb\nitUlnwGRL/sj7d5GyQIDAQAB\n-----END PUBLIC KEY-----",
                        //    "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
                        //    "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
                        //    "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
                        //    "pwd1": "[\"n136va4JjXjbYBGapT8FewLKACA5iCNxNFEg6qmUn7/uydqYOqkCKhcSYkpXFpdd3E7rZgAgoSy20bnoNwIruK/JHRapPz24tWrYv516Cl9hC778IWZFTyU0Rhl21axGIgLAvcFkIKq2cT4OgzYuTt4y5YTqw3JKJUzTK9F5CHLtzgJyyOwcx0VNDRGOcZ1usPx8MlSi95f3sMnBcIAtY8IvNSFvsg==\",\"GH2vevBGncKvjRWqNIRp/A==\",\"gWXNAfcHe1VX+viCiOaqSiUMUoWN4GPi///8nEYCMd3ktZwejzoHNJFV+LskTU4Aw/tmYhj1FOZhoNPBxv0jtg==\"]",
                        //    "prvkey": "U2FsdGVkX195BEgVCqqpVaZ32sZzEBXodkFpz8d436nANHPmCwnyBUAO+t8HLfaNxEtLGBzC5RzQvo8vXwopfz4gO3CoXUdni/0Y1dhXoXKX/OZ5WeDSooJDbOD7XZJQP13qsGdX5cZuR96sMfO546uJ5y8olDW8dZVxrjw6kV0hzbv3rEn3vvLzNwRw5iN+ULtbgRfYzA/3EJ2DDdlzJTVab24th3Qw1DAlEHAoSKKt232OXDOkfSgylFFbWLPrJHOlZ+4broX/w195MkNxAsPvoDKYMr485om7nSifPR2nHMvsMGwueiJTHfcmCwYQ0HFguhViwI/aznw2T+PnqV4nbSKZILoLXlspOoWLBbL1vf6nJa1NE/wfUoWHIZkqccCBiimPc1LbaIy6I539AbRNV9WJSDAdI+TGosFxuvcjZ22jL9nHARCxdW0boQhF+BI5X1mP/LmHwS1d3BSXpLrHlc1kmHqvA5Bl0C2QlpA9b46FyB5yKxPCZKyrLPTMo+KsIAYUPGCo/RV5JlE73s53izY7aSZsXkiLu17p9zFFQXdwIY8ZggY40ZvkJQ3f6gtw1nuU2eT/zhHG+ao62uBziFnVBN/kU4KoIkAeGOKMEgjGvAeliaQ2C2qU0YKOY6gdJGo+bbVepnzBNvcrjkUOQLU7SkQWOe9Nn8TNJ/3VCs+ubGXkL/ItKcHQB3KkILVr///eSXzc1AxJxspv8mQp9Zi0GDk/EcjSIsb61AHTKJXV5SkBmDHDDJHBZ92wUSGnqCQ6dPsvcUt/9YoHjlvlfb++HeYDwixWiQoZssSp4viNrVEhWrHIE3jVGrXKcr4Ojf6HNMaKszHafKSL2weCpApz20l1xu9V9iPXKXk82HNUEaK6BnzjwaCXwFqufEaYkMk+bhu+/FC4trJwIIC//XbH0Aw0ED0QXInghAlW/jv7QBCDKuzhEMFKyQJHAscNLMrVP7cjIrpLeMY1KV2RLNpp0bvCtC7L4q++rkYF5YPqjBMBF0yuOJVk0/1hvzL/d6uClublDAhlR3Tk8gQbcvlVKfXiEUqXt4EnE6N6gv+SyITM9FGVH55CJQcAEcirCLpI7LsUB4xEXYsb3E1jvvEI5OOxsNGEEFiyXoQYIiokH/I/1hiaVXmsBYcjK0eKrRil16EcphoOu+eRpGGurkWEEQI8laIsjKrqUzUm4zesxfzgmBhhlUd3TsIp",
                        //    "sessionid": "U2FsdGVkX1/0a09r+5JZgesSVAoaN7d/jrGpc4x3mhHfQY83Rewr5yMnU2awz9Emru2y69CPpZyYTQh/G/20TPyqua02waHlzATaChw5xYY="
                        //};
                        ls_save() ;
                        cb() ;
                    }) ; // encrypt_2 callback 2

                }) ; // get_session_filenames callback 1

            } // save_session

            // w2 startup 1: check and save any sessionid param and redirect without sessionid in URL
            function is_sessionid() {
                var pgm = service + '.is_sessionid: ' ;
                var sessionid, a_path, z_path ;
                sessionid = $location.search()['sessionid'] ;
                if (!sessionid) return false ; // no sessionid in url
                // new sessionid received from MN. save and redirect without sessionid
                new_sessionid = sessionid ;
                console.log(pgm + 'initialize step 1: new_sessionid = ' + new_sessionid + ' was received from MN') ;
                status.session_handshake = 'Received sessionid from MN' ;
                // redirect
                a_path = '/wallet' ;
                z_path = "?path=" + a_path ;
                $location.path(a_path).search({sessionid:null}) ;
                $location.replace();
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Money Network W2", z_path]) ;
                return true;
            } // is_sessionid

            // w2 startup 2: check merger permission. required for most ZeroFrame operations
            function check_merger_permission(cb) {
                var pgm = service + '.check_merger_permission: ';
                if (!cb) cb = function () {};
                var request1 = function (cb) {
                    var pgm = service + '.check_merger_permission.request1: ';
                    ZeroFrame.cmd("wrapperPermissionAdd", "Merger:MoneyNetwork", function (res) {
                        console.log(pgm + 'res = ', JSON.stringify(res));
                        if (res == "Granted") {
                            request2(cb);
                            status.merger_permission = 'Granted';
                        }
                        else cb(false);
                    });
                }; // request1
                var request2 = function (cb) {
                    var pgm = service + '.check_merger_permission.request2: ';
                    get_my_user_hub(function (hub) {
                        ZeroFrame.cmd("mergerSiteAdd", [hub], function (res) {
                            console.log(pgm + 'res = ', JSON.stringify(res));
                            cb((res == 'ok'));
                        });
                    });
                }; // request2

                // wait for ZeroFrame.site_info to be ready
                var retry_check_merger_permission = function () {
                    check_merger_permission(cb)
                };
                if (!ZeroFrame.site_info) {
                    $timeout(retry_check_merger_permission, 500);
                    return;
                }
                // if (!ZeroFrame.site_info.cert_user_id) return cb(false); // not logged in

                // console.log(pgm , 'site_info = ' + JSON.stringify(site_info)) ;
                if (ZeroFrame.site_info.settings.permissions.indexOf("Merger:MoneyNetwork") == -1) {
                    status.merger_permission = 'Missing';
                    return request1(cb);
                }
                status.merger_permission = 'Granted';
                ZeroFrame.cmd("mergerSiteList", {}, function (merger_sites) {
                    var pgm = service + '.check_merger_permission mergerSiteList callback 2: ';
                    console.log(pgm + 'merger_sites = ', JSON.stringify(merger_sites));
                    get_my_user_hub(function (hub) {
                        if (merger_sites[hub] == "MoneyNetwork") cb(true);
                        else request2(cb);
                    });
                }); // mergerSiteList callback 2
            } // check_merger_permission

            // w2 startup 3: check cert_user_id. Must be present

            // w2 startup 4: update wallet.json

            // w2 startup 5: check old session. restore from localStorage and password from MN
            function is_old_session (cb) {
                var pgm = service + '.is_old_session: ' ;
                var cert_user_id, info, encrypted_session_pwd1 ;
                if (!ls.sessions) {
                    console.log(pgm + 'no old sesions found in ls. ls = ' + JSON.stringify(ls)) ;
                    return cb() ;
                } // no saved sessions
                if (!ZeroFrame.site_info) {
                    console.log(pgm + 'invalid call. ZeroFrame is still loading') ;
                    return cb() ;
                }
                cert_user_id = ZeroFrame.site_info.cert_user_id ;
                if (!cert_user_id) {
                    console.log(pgm + 'invalid call. ZeroId not selected. Cert_user_id is null') ;
                    return cb() ;
                }
                info = ls.sessions[cert_user_id] ;
                if (!info) {
                    console.log(pgm + 'no old session was found for ' + cert_user_id) ;
                    return cb() ;
                }
                if (!info.encrypted_info) {
                    console.log(pgm + 'error in saved session for ' + cert_user_id + '. no encrypted_info. info = ' + JSON.stringify(info)) ;
                    delete ls.sessions[cert_user_id] ;
                    ls_save() ;
                    return cb() ;
                }

                // ready for session info decrypt and get_password request
                get_user_path(function (user_path) {
                    var pgm = service + '.is_old_session get_user_path callback 1: ' ;
                    status.session_handshake = 'Checking old session' ;
                    // decrypt pwd1, this_session_filename and other_session_filename
                    console.log(pgm + 'found old session. cryptMessage decrypting "info.encrypted_info"') ;
                    encrypt1.decrypt_2(info.encrypted_info, function(decrypted_info) {
                        var pgm = service + '.is_old_session decrypt_2 callback 2: ' ;
                        var array_names, array, i, temp_pwd1, request ;
                        array_names = ['session_pwd1', 'unlock_pwd2', 'this_session_filename', 'other_session_filename'] ;
                        array = JSON.parse(decrypted_info) ; // [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename]
                        if (array.length != array_names.length) {
                            console.log(pgm + 'error in saved session for ' + cert_user_id + '. Expected encrypted_info array.length = ' + array_names.length + '. Found length = ' + array.length) ;
                            delete ls.sessions[cert_user_id] ;
                            ls_save() ;
                            return cb() ;
                        }
                        for (i=0; i<array_names.length ; i++) {
                            if (typeof array[i] != 'string') {
                                console.log(pgm + 'error in saved session for ' + cert_user_id + '. Expected ' + array_names[i] + ' to be a string. array[' + i + '] = "' + JSON.stringify(array[i]) + '"') ;
                                delete ls.sessions[cert_user_id] ;
                                ls_save() ;
                                return cb() ;
                            }
                        }
                        temp_pwd1 = array[0] ;
                        // setup temporary encryption for get_password message.
                        // special encryption for get_password request! No sessionid and no JSEncrypt prvkey (normally 3 layers encryption)
                        // request is encrypted with JSEncrypt and cryptMessage (encryptions=[1,2]) using MN public keys
                        // response is encrypted with cryptMessage only (encryptions=[2]) using W2 cryptMessage public key
                        encrypt2 = new MoneyNetworkAPI({
                            debug: 'encrypt2',
                            pubkey: info.other_pubkey,
                            pubkey2: info.other_pubkey2,
                            user_path: user_path,
                            this_session_filename: array[2],
                            other_session_filename: array[3],
                            cb: process_incoming_message
                        }) ;
                        // send get_password request. wait for max 5 seconds for response. MN session must be running and user must be logged in with correct account
                        request = {
                            msgtype: 'get_password',
                            pubkey: info.this_pubkey,
                            pubkey2: info.this_pubkey2,
                            unlock_pwd2: array[1]
                        } ;
                        console.log(pgm + 'found old session. sending get_password request to MN. request = ' + JSON.stringify(request)) ;
                        encrypt2.send_message(request, {encryptions:[1,2], response:5000}, function (response) {
                            var pgm = service + '.is_old_session send_message callback 3: ' ;
                            var temp_pwd2, temp_pwd, temp_prvkey, temp_sessionid, encrypted_pwd2 ;
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. timeout after 5 seconds. MN session not running or not logged in
                                // error = "Timeout while waiting for response. Request was {\"msgtype\":\"get_password\",\"pubkey\":\"-----BEGIN PUBLIC KEY-----\\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHkYQzcBcq7nc8ktXslYyhkZrlja\\n7fGxu5cxqGVhp/w+905YT4jriF0IosiBeDyPGCJdQCS0IfJ9wMHP1rSIJ7KvLI5R\\nzfFcdqOMliMzEeTva29rkCmZSNw++2x7aIJQO9aExp03bm/l49zh/MbwFnZmrmS7\\nAOGgDzFPapIUQXenAgMBAAE=\\n-----END PUBLIC KEY-----\",\"pubkey2\":\"Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R\",\"unlock_pwd2\":\"280eab8147\",\"response\":1469138736361}. Expected response filename was 3253c3b046.1469138736361"
                                console.log(pgm + 'OK. Timeout for get_password request. MN session is not running or MN session is not logged in. Cannot restore old session from localStorage');
                                status.session_handshake = 'n/a' ;
                                return cb() ;
                            }
                            if (!response || response.error) {
                                console.log(pgm + 'get_password request failed. response = ' + JSON.stringify(response)) ;
                                status.session_handshake = 'n/a' ;
                                return cb() ;
                            }
                            console.log(pgm + 'got get_password response from MN. response = ' + JSON.stringify(response));
                            // got cryptMessage encrypted pwd2 from MN
                            encrypted_pwd2 = response.password ;
                            temp_pwd2 = MoneyNetworkAPILib.aes_decrypt(encrypted_pwd2, temp_pwd1) ;
                            temp_pwd = temp_pwd1 + temp_pwd2 ;
                            // console.log(pgm + 'got encrypted pwd2 from MN. encrypted_pwd2 = ' + encrypted_pwd2 + ', temp_pwd2 = ' + temp_pwd2) ;
                            // console.log(pgm + 'decrypting prvkey. info.prevkey = ' + info.prvkey + ', temp_pwd = ' + temp_pwd) ;
                            temp_prvkey = MoneyNetworkAPILib.aes_decrypt(info.prvkey, temp_pwd) ;
                            // console.log(pgm + 'decrypted prvkey. prvkey = ' + temp_prvkey) ;

                            temp_sessionid = MoneyNetworkAPILib.aes_decrypt(info.sessionid, temp_pwd) ;
                            status.session_handshake = 'Old session with sessionid ' + temp_sessionid + ' was restored from localStorage' ;
                            status.sessionid = temp_sessionid ;
                            encrypt2 = new MoneyNetworkAPI({
                                debug: 'encrypt2',
                                sessionid: temp_sessionid,
                                pubkey: info.other_pubkey,
                                pubkey2: info.other_pubkey2,
                                prvkey: temp_prvkey,
                                user_path: user_path,
                                cb: process_incoming_message
                            }) ;
                            cb(status.sessionid) ;
                        }) ; // send_message callback 3

                    }) ; // decrypt_2 callback 2

                }) ; // get_user_path callback 1

            } // is_old_session

            // w2 startup 6: check new session
            function is_new_session (cb) {
                var pgm = service + '.is_new_session: ' ;
                var a_path, z_path ;
                if (!cb) cb = function() {} ;
                if (status.sessionid) {
                    console.log(pgm + 'invalid call. sessionid already found') ;
                    cb() ;
                    return false ;
                } // continue old session
                if (!new_sessionid) {
                    console.log(pgm + 'no sessionid was received from MN') ;
                    cb() ;
                    return false ;
                }
                status.sessionid = new_sessionid ;
                MoneyNetworkAPILib.add_session(status.sessionid); // monitor incoming messages for this sessionid
                encrypt2.setup_encryption({sessionid: status.sessionid, debug: true}) ;
                console.log(pgm + 'encrypt2.other_session_filename = ' + encrypt2.other_session_filename) ;
                console.log(pgm + 'sessionid              = ' + status.sessionid) ;
                // read MN public keys message using dbQuery loop and fileGet operations
                read_pubkeys(function (ok) {
                    var pgm = service + '.is_new_session read_pubkeys callback: ' ;
                    console.log(pgm + 'ok = ' + JSON.stringify(ok)) ;
                    console.log(pgm + 'saved sessionid = ' + status.sessionid) ;
                    cb(status.sessionid) ;
                }) ; // read_pubkeys callback
            } // is_new_session

            // startup sequence 2-6:
            // params:
            // - startup: true: startup, false: changed cert_user_id
            // - cb: callback function. returns sessionid and save_wallet_login
            var old_cert_user_id ;
            function initialize (startup, cb) {
                var pgm = service + '.initialize: ' ;
                console.log(pgm + 'startup=', startup, ', cb=', cb) ;
                if (!cb) cb = function() {} ;
                if (!startup && old_cert_user_id && ZeroFrame.site_info && old_cert_user_id != ZeroFrame.site_info.cert_user_id) {
                    // reset session variables
                    console.log(pgm + 'changed cert_user_id. reset encrypts and sessionid') ;
                    status.sessionid = null ;
                    encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ;
                    encrypt2 = new MoneyNetworkAPI({debug: 'encrypt2', cb: process_incoming_message}) ;
                }
                // step 2 - check merger permission. session is not possible without merger permission
                console.log(pgm + 'initialize step 2: check merger permission') ;
                check_merger_permission(function(ok) {
                    var pgm = service + '.initialize step 2 check_merger_permission callback 1: ' ;
                    if (!ok) {
                        return cb(null) ;
                    } // no merger permission
                    // step 3 - check zeroNet login
                    console.log(pgm + 'initialize step 3: check ZeroNet login') ;
                    if (!ZeroFrame.site_info.cert_user_id) return cb(null); // not logged in
                    old_cert_user_id = ZeroFrame.site_info.cert_user_id ;
                    // step 4 - update wallet.json
                    console.log(pgm + 'initialize step 4: update wallet.json') ;
                    update_wallet_json(function (res) {
                        var pgm = service + '.initialize update_wallet_json callback 2: ' ;
                        var cb2 ;
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        // extend cb. lookup save_wallet from ls
                        cb2 = function (sessionid) {
                            var save_wallet_login ;
                            if (sessionid) {
                                // session found. check save_wallet_login
                                if (!ls.save_login) ls.save_login = {} ;
                                if (!ls.save_login[old_cert_user_id]) ls.save_login[old_cert_user_id] = '0' ;
                                save_wallet_login = ls.save_login[old_cert_user_id] ;
                                ls_save() ;
                            }
                            cb(sessionid, save_wallet_login) ;
                        };
                        // check for old (1. priority) or new (2. priority) session
                        // step 5 - check old session
                        console.log(pgm + 'initialize step 5: check old session') ;
                        is_old_session(function(sessionid) {
                            var pgm = service + '.initialize is_old_session callback 3: ' ;
                            console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid)) ;
                            if (sessionid) {
                                $rootScope.$apply() ;
                                return cb2(sessionid);
                            } // session was restored from localStorage
                            // step 6 - check new session
                            console.log(pgm + 'initialize step 6: check new session');
                            is_new_session(function(sessionid) {
                                var pgm = service + '.initialize is_new_session callback 4: ' ;
                                console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid)) ;
                                if (!sessionid) return cb2(null);
                                $rootScope.$apply() ;
                                save_session(function() { cb2(sessionid)}) ;
                            }) ; // is_new_session callback 4

                        }) ; // is_old_session callback 3

                    }) ; // update_wallet_json callback 2

                }) ; // check_merger_permission callback 1

            } // initialize



            function get_sessionid () {
                return status.sessionid ;
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



            // export kW2Service
            return {
                // localStorage functions
                ls_bind: ls_bind,
                ls_get: ls_get,
                ls_save: ls_save,
                get_wallet_login: get_wallet_login,
                save_wallet_login: save_wallet_login,
                // session functions
                generate_random_string: generate_random_string,
                is_sessionid: is_sessionid,
                initialize: initialize,
                get_status: get_status
            };

            // end kW2Service
        }])

;
