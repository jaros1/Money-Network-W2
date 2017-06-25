
angular.module('MoneyNetworkW2')

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
                    var key, cb
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
                wait_for_site_info = function() { ls_loaded(res) }
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


            var encrypt1 = new MoneyNetworkAPI({debug: true}) ; // encrypt/decrypt data in localStorage ;

            // get save wallet status: 0, 1 or 2
            // todo: what about 2 and no session? user must connect to MoneyNetwork to get data from MoneyNetwork
            function get_save_wallet_login() {
                if (!ZeroFrame.site_info.cert_user_id) return null ; // error - ZeroId is missing
                if (!ls.save_wallet_login) ls.save_wallet_login = {} ;
                if (!ls.save_wallet_login[ZeroFrame.site_info.cert_user_id]) ls.save_wallet_login[ZeroFrame.site_info.cert_user_id] = '0' ;
                return ls.save_wallet_login[ZeroFrame.site_info.cert_user_id] ;
            } // get_save_wallet_login


            // send message to MoneyNetwork and optional wait for response (receipt = true)
            function send_message (json, receipt, cb) {
                // send message using encrypt2 (MoneyNetworkAPI)
                encrypt2.send_message(json, receipt, cb) ;
            } // send_message


            // save_wallet_login:
            // - '1': wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
            function get_wallet_login(save_wallet_login, cb) {
                var pgm = service + '.get_wallet_login: ' ;
                var error, cert_user_id, encrypted_json, json ;
                if (['1','2'].indexOf(save_wallet_login) == -1) return cb(null, null, "Invalid call. save_wallet_login must be equal '1' or '2'") ;
                if (save_wallet_login == '1') {
                    // wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
                    if (!ls.wallet_login) return cb(null, null, 'wallet_login hash was not found in localStorage') ;
                    if (typeof ls.wallet_login != 'object') {
                        error = 'wallet_login is not a hash. wallet_login = ' + JSON.stringify(ls.wallet_login) ;
                        ls.wallet_login = {} ;
                        return cb(null, null, error) ;
                    }
                    cert_user_id = ZeroFrame.site_info.cert_user_id ;
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
                    // wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
                    if (!sessionid) return cb(null, null, 'Cannot read wallet information. MoneyNetwork session was not found');
                    // send get_data message to MoneyNetwork and wait for receipt
                    json = { msgtype: 'get_data', receipt: true } ;
                    send_message(json, true, function (json) {
                        var encrypted_data ;
                        if (json.error) return cb({error: json.error}) ;
                        encrypted_data = json.data ;
                        encrypt1.decrypt(encrypted_data, function (data) {
                            if (!data) cb({error: 'decrypt receipt failed'}) ;
                            else cb({wallet_id: data.wallet_id, wallet_password: data.wallet_password}) ;
                        }) ; // decrypt callback
                    }) ; // send_message callback
                }
            } // get_wallet_login


            // save_wallet_login:
            // - '0': no thank you. Clear any wallet data previously saved with '1' or '2'
            // - '1': wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
            function save_wallet_login(save_wallet_login, wallet_id, wallet_password, cb) {
                var pgm = service + '.save_wallet_login: ' ;
                var cert_user_id, ls_updated, data, request ;
                if (['0', '1','2'].indexOf(save_wallet_login) == -1) return cb(null, null, "Invalid call. save_wallet_login must be equal '0', '1' or '2'") ;
                // 1 - wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
                cert_user_id = ZeroFrame.site_info.cert_user_id ;
                if (save_wallet_login == '1') {
                    // save as 1
                    if (!ls.wallet_login) ls.wallet_login = {} ;
                    if (!ls.wallet_login[cert_user_id]) ls.wallet_login[cert_user_id] = {} ;
                    ls.wallet_login[cert_user_id].wallet_id = wallet_id ;
                    ls.wallet_login[cert_user_id].wallet_password = wallet_password ;
                    console.log(pgm + 'ls.wallet_login = ' + JSON.stringify(ls.wallet_login)) ;
                    ls_save() ;
                }
                else {
                    // 0 or 2. clear old 1
                    if (ls.wallet_login) {
                        ls_updated = false ;
                        if (ls.wallet_login[cert_user_id]) {
                            delete ls.wallet_login[cert_user_id] ;
                            ls_updated = true ;
                        }
                        if (!Object.keys(ls.wallet_login).length) {
                            delete ls.wallet_login ;
                            ls_updated = true ;
                        }
                        if (ls_updated) ls_save() ;
                    }
                }
                // 2 - wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
                if (save_wallet_login == '2') {
                    if (!sessionid) return cb('Cannot save wallet information. MoneyNetwork session was not found');
                    // encrypt wallet data before sending data to MoneyNetwork
                    data = { wallet_id: wallet_id, wallet_password: wallet_password} ;
                    console.log(pgm + 'data = ' + JSON.stringify(data));
                    // cryptMessage encrypt data with current ZeroId before sending data to MoneyNetwork
                    encrypt1.encrypt_json(data, [2],function (encrypted_data) {
                        var pgm = service + '.save_wallet_login encrypt_json callback 1: ';
                        var json;
                        console.log(pgm + 'data (encrypted) = ' + JSON.stringify(encrypted_data));
                        // send encrypted wallet data to MoneyNetwork and wait for receipt
                        json = { msgtype: 'save_data', data: encrypted, receipt: true} ;
                        console.log(pgm + 'json = ' + JSON.stringify(json));
                        send_message(json, true, function (receipt) {
                            var pgm = service + '.save_wallet_login send_message callback 2: ';
                            if (!receipt) cb({error: 'No receipt'}) ;
                            else if (receipt.error) cb({error: receipt.error}) ;
                            else cb({}) ;
                        }) // send_message callback 2
                    }) ; // encrypt_json callback 1
                }
                else {
                    // 0 or 1. clear old 2
                    if (!sessionid) return cb('Cannot clear wallet information. MoneyNetwork session was not found') ;
                    // send data_delete to MoneyNetwork session
                    request = {msgtype: 'delete_data', receipt: false};
                    console.log(pgm + 'json = ' + JSON.stringify(request));
                    send_message(request, true, function (response) {
                        var pgm = service + '.save_wallet_login send_message callback 1: ';
                        if (!response) cb({error: 'No response'}) ;
                        else if (response.error) cb({error: response.error}) ;
                        else cb({}) ;
                    }); // send_message callback 1
                }
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

                // get a list of MoneyNetwork Wallet data hubs
                // ( MoneyNetwork merger sites with title startingwith "W2 ")
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
                        // 1) list of MoneyNetwork merger sites (mergerSiteList)
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
                if (!ZeroFrame.site_info.auth_address) throw pgm + "invalid call. ZeroId is missing" ;
                if (z_cache.user_path == true) {
                    // wait for previous user_path request to finish
                    get_user_path_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.user_path) return cb(z_cache.user_path) ; // OK
                z_cache.user_path = true ;
                get_my_user_hub(function (my_hub) {
                    z_cache.user_path = 'merged-MoneyNetwork/' + my_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' ;
                    encrypt2.setup_encryption({user_path: z_cache.user_path});
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
                    add_optional_files_support(function() {
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
                                return;
                            }

                            // sitePublish OK
                            z_publish_interval = 0;
                            cb(null);

                        }) ; // sitePublish callback 3

                    }) ; // add_optional_files_support callback 2

                }) ; // get_user_path callback 1

            } // z_publish

            // optional file pattern must be added to content.json BEFORE any optional files are written to user directory
            var optional_files_support_ok = null ;
            var add_optional_files_support_cbs = [] ; // pending callbacks (first call)
            function add_optional_files_support (cb) {
                var pgm = service + '.add_optional_files_support: ' ;
                if (optional_files_support_ok == true) return cb() ;
                if (optional_files_support_ok == false) return add_optional_files_support_cbs.push(cb) ;
                optional_files_support_ok = false ; // start callback queue
                get_user_path(function (user_path) {
                    var pgm = service + '.add_optional_files_support get_user_path callback 1: ' ;
                    get_content_json(function (content) {
                        var pgm = service + '.add_optional_files_support get_content_json callback 2: ' ;
                        var optional, json_raw, execute_callbacks, inner_path ;
                        optional = "^[0-9a-f]{10}.[0-9]{13}$" ;
                        // console.log(pgm + 'content = ' + JSON.stringify(content)) ;
                        // console.log(pgm + 'optional = ' + optional) ;
                        execute_callbacks = function() {
                            optional_files_support_ok = true ;
                            cb() ;
                            while (add_optional_files_support_cbs.length) { cb = add_optional_files_support_cbs.shift() ; cb() }
                        } ;
                        if (content.optional == optional) return execute_callbacks() ; // optional files support already OK
                        inner_path = user_path + 'content.json' ;
                        if (JSON.stringify(content).length == 2) {
                            // empty content.json file. write wallet + sign + add optional to content.json file
                            write_wallet_json(function (res) {
                                var pgm = service + '.add_optional_files_support write_wallet_json callback 3a: ' ;
                                // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                if (res != "ok") {
                                    console.log(pgm + user_path + 'wallet.json fileWrite failed. error = ' + JSON.stringify(res));
                                    return ;
                                }
                                console.log(pgm + 'sign content.json without optional files support') ;
                                console.log(pgm + inner_path + ' siteSign start');
                                ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                                    var pgm = service + '.add_optional_files_support write_wallet_json callback 4a: ' ;
                                    // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                    if (res != "ok") {
                                        console.log(pgm + inner_path + ' siteSign failed. error = ' + JSON.stringify(res) + '. maybe already optional files in user directory?') ;
                                        return ;
                                    }
                                    console.log(pgm + 'adding optional to new content.json file');
                                    // read signed content.json file (disable z_cache)
                                    delete z_cache.content_json ;
                                    get_content_json(function (content) {
                                        var pgm = service + '.add_optional_files_support get_content_json callback 5a: ' ;
                                        if (JSON.stringify(content).length == 2) {
                                            console.log(pgm + inner_path + ' fileGet failed. content = ' + JSON.stringify(content)) ;
                                            return ;
                                        }
                                        // add optional files support
                                        content.optional = optional ;
                                        console.log(pgm + 'content = ' + JSON.stringify(content)) ;
                                        write_content_json(function (res) {
                                            var pgm = service + '.add_optional_files_support write_content_json callback 6a: ' ;
                                            // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                            if (res != 'ok') {
                                                console.log(pgm + 'content.json write failed. error = ' + JSON.stringify(res)) ;
                                                return ;
                                            }
                                            // sign updated content.json with optional files support
                                            console.log(pgm + inner_path + ' siteSign start');
                                            ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                                                var pgm = service + '.add_optional_files_support siteSign callback 7a: ' ;
                                                // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                if (res != "ok") {
                                                    console.log(pgm + inner_path + ' siteSign failed. error = ' + JSON.stringify(res) + '. maybe already optional files in user directory?') ;
                                                    return ;
                                                }
                                                // OK. optional files support added to content.json
                                                execute_callbacks() ;
                                            }) ; // siteSign callback 7

                                        }) ; // write_content_json callback 6

                                    }) ; // get_content_json callback 5

                                }) ; // siteSign callback 4

                            }) ; // write_wallet_json callback 3
                            return ;
                        }
                        console.log(pgm + 'adding optional to existing content.json file. will fail if there are existing optional files');
                        content.optional = optional ;
                        // write content.json
                        write_content_json(function (res) {
                            var pgm = service + '.add_optional_files_support write_content_json callback 3b: ' ;
                            console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                            if (res != 'ok') {
                                console.log(pgm + 'content.json write failed.') ;
                                return ;
                            }
                            // sign updated content.json
                            console.log(pgm + inner_path + ' siteSign start');
                            ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                                var pgm = service + '.add_optional_files_support siteSign callback 4b: ' ;
                                console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                execute_callbacks() ;
                            }) ; // siteSign callback 5

                        }) ;

                    }) ; // get_content_json callback 2

                }) ; // get_user_path callback 1

            } // add_optional_files_support


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

            function create_session(cb) {
                var pgm = service + '.create_session: ';
                if (!cb) cb = function () {};
                if (!sessionid) return cb('No session. wallet.json was not updated');
                get_wallet_json(function (wallet) {
                    var pgm = service + '.create_session get_wallet_json callback 1: ';
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                    var old_wallet_str = JSON.stringify(wallet) ;
                    wallet.wallet_address = ZeroFrame.site_info.address;
                    wallet.wallet_title = ZeroFrame.site_info.content.title;
                    wallet.wallet_description = ZeroFrame.site_info.content.description;
                    if (old_wallet_str == JSON.stringify(wallet)) return ; // no change to public wallet information
                    console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                    write_wallet_json(function (res) {
                        console.log(pgm + 'res = ' + JSON.stringify(res));
                        if (res == "ok") z_publish(cb);
                        else cb(res);
                    });
                }); // get_wallet callback 1
            } // save_wallet

            // money network session from MoneyNetwork. only relevant if wallet is called from MoneyNetwork with a sessionid
            var encrypt2 = new MoneyNetworkAPI({debug: true}) ; // encrypt/decrypt messages
            var sessionid ; // unique sessionid. also like a password known only by MoneyNetwork and MoneyNetworkW2 sessions
            var this_session_filename ;  // filename used by MoneyNetwork wallet session
            var this_pubkey ;            // JSEncrypt public key used by MoneyNetwork wallet session
            var this_pubkey2 ;           // cryptMessage public key used by MoneyNetwork wallet session
            var other_pubkey ;           // JSEncrypt pubkey from MoneyNetwork session
            var other_pubkey2 ;          // cryptMessage pubkey2 from MoneyNetwork session
            var other_session_filename ; // filename used by MoneyNetwork session

            // read "pubkeys" message from MoneyNetwork session
            // optional file with file format <other_session_filename>.<timestamp>
            // pubkey used by JSEncrypt (client) and pubkey2 used by cryptMessage (ZeroNet)
            function read_pubkeys () {
                var pgm = service + '.read_pubkeys: ' ;
                var prefix = "Error. MoneyNetwork session handshake failed. " ;

                var query =
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
                    var pgm = service + '.read_pubkeys dbQuery callback 1: ' ;
                    var inner_path ;
                    // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    if (res.error) {
                        console.log(pgm + prefix + 'cannot read pubkeys message. dbQuery failed with ' + res.error) ;
                        console.log(pgm + 'query = ' + query) ;
                        sessionid = null ;
                        return ;
                    }
                    if (res.length == 0) {
                        console.log(pgm + prefix + 'pubkeys message was not found') ;
                        console.log(pgm + 'query = ' + query) ;
                        sessionid = null ;
                        return ;
                    }
                    inner_path = 'merged-MoneyNetwork/' + res[0].directory + '/' + res[0].filename ;
                    // console.log(pgm +  inner_path + ' fileGet start') ;
                    ZeroFrame.cmd("fileGet", [inner_path, true], function (pubkeys_str) {
                        var pgm = service + '.read_pubkeys fileGet callback 2: ' ;
                        var pubkeys, now, content_signed, file_timestamp ;
                        // console.log(pgm + 'pubkeys_str = ' + pubkeys_str) ;
                        if (!pubkeys_str) {
                            console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' was not found') ;
                            sessionid = null ;
                            return ;
                        }
                        // todo: check pubkeys message timestamps. must not be old or > now.
                        now = Math.floor(new Date().getTime()/1000) ;
                        content_signed = res[0].modified ;
                        file_timestamp = Math.floor(parseInt(res[0].filename.substr(11))/1000) ;
                        console.log(pgm + 'timestamps: ' +
                            'file_timestamp = ' + file_timestamp +
                            ', content_signed = ' + content_signed +
                            ', now = ' + now) ;
                        console.log(pgm + 'todo: validate pubkeys json message') ;
                        pubkeys = JSON.parse(pubkeys_str) ;
                        console.log(pgm + 'MoneyNetwork session keys: ' +
                            'pubkey2 = ' + pubkeys.pubkey2 +
                            ', pubkey = ' + pubkeys.pubkey) ;
                        encrypt2.setup_encryption({pubkey: pubkeys.pubkey, pubkey2: pubkeys.pubkey2}) ;

                        // return my public keys to MoneyNetwork session
                        write_pubkeys() ;

                    }) ; // fileGet callback 2

                }) ; // dbQuery callback 1

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
                // save JSEncrypt private key for decrypt_2
                encrypt2.setup_encryption({prvkey: prvkey}) ;
                return this_pubkey ;
            } // get_my_pubkey

            // get public key for cryptMessage
            function get_my_pubkey2 (cb) {
                if (this_pubkey2) return cb(this_pubkey2) ;
                ZeroFrame.cmd("userPublickey", [0], function (my_pubkey2) {
                    this_pubkey2 = my_pubkey2 ;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2}) ;
                    cb(this_pubkey2) ;
                }) ;
            } // get_my_pubkey2


            function write_pubkeys() {
                // collect info before returning public keys information to MoneyNetwork session
                get_user_path(function (user_path) {
                    var my_pubkey = get_my_pubkey() ;
                    get_my_pubkey2(function (my_pubkey2) {
                        add_optional_files_support(function() {
                            var pgm = service + '.write_pubkeys get_my_pubkey2 callback 3: ' ;
                            var inner_path2, json, raw ;
                            inner_path2 = user_path + this_session_filename + '.' + (new Date().getTime()) ;
                            // todo: validate json message. API with msgtypes and validating rules
                            json = {
                                msgtype: 'pubkeys',
                                pubkey: my_pubkey, // for JSEncrypt
                                pubkey2: my_pubkey2 // for cryptMessage
                            } ;
                            encrypt2.encrypt_json(json, [1,2,3], function(json) {
                                var pgm = service + '.write_pubkeys encrypt_json callback 4: ' ;
                                var json_raw ;
                                json_raw = unescape(encodeURIComponent(JSON.stringify(json, null, "\t")));
                                console.log(pgm + 'writing optional file ' + inner_path2) ;
                                ZeroFrame.cmd("fileWrite", [inner_path2, btoa(json_raw)], function (res) {
                                    var pgm = service + '.write_pubkeys fileWrite callback 5: ' ;
                                    var inner_path3 ;
                                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                    // sign. should update wallet database. publish is not needed.
                                    inner_path3 = user_path + 'content.json' ;
                                    console.log(pgm + 'sign content.json with optional file ' + inner_path2) ;
                                    ZeroFrame.cmd("siteSign", {inner_path: inner_path3}, function (res) {
                                        var pgm = service + '.write_pubkeys siteSign callback 6: ' ;
                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                    }) ; // siteSign callback 6

                                }) ; // writeFile callback 5

                            }) ; // encrypt_json callback 4

                        }) ; // add_optional_files_support callback 3

                    }) ; // get_my_pubkey2 callback 2

                }) ; // get_user_path callback 1

            } // write_pubkeys

            // called after wallet startup. check and save sessionid and pubkey2
            function is_new_session () {
                var pgm = service + '.is_new_session: ' ;
                var new_sessionid, a_path, z_path, new_pubkey2, sha256 ;
                if (sessionid) return false ; // continue old session
                new_sessionid = $location.search()['sessionid'] ;
                new_pubkey2 = $location.search()['pubkey2'] ;
                if (!new_sessionid) return false ; // no session
                // new session. save and redirect without sessionid
                sessionid = new_sessionid ;
                encrypt2.setup_encryption({sessionid: new_sessionid, debug: true}) ;
                sha256 = CryptoJS.SHA256(sessionid).toString() ;
                other_session_filename = sha256.substr(0,10) ; // first 10 characters of sha256 signature
                this_session_filename = sha256.substr(sha256.length-10); // last 10 characters of sha256 signature
                console.log(pgm + 'this_session_filename = ' + this_session_filename);
                console.log(pgm + 'other_session_filename = ' + other_session_filename);
                // async read pubkey and pubkey2 from "pubkeys" message from MoneyNetwork using dbQuery wait and fileGet operations
                read_pubkeys() ;
                console.log(pgm + 'saved sessionid = ' + sessionid) ;
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
                get_save_wallet_login: get_save_wallet_login,
                get_wallet_login: get_wallet_login,
                save_wallet_login: save_wallet_login,
                // session functions
                generate_random_string: generate_random_string,
                is_new_session: is_new_session,
                get_sessionid: get_sessionid,
                create_session: create_session,
                get_my_user_hub: get_my_user_hub
            };

            // end kW2Service
        }])

;
