angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['$rootScope', '$timeout', 'MoneyNetworkW2Service', 'btcService', function ($rootScope, $timeout, W2Service, btcService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

        // status: merger permission and session status
        self.status = W2Service.get_status() ;
        self.z = ZeroFrame ;

        // MoneyNetwork (MN) and MoneyNetwork W2 (W2) session handshake.
        var sessionid ;
        if (W2Service.is_sessionid()) return ; // 1: wait for redirect without sessionid in URL

        // 2-6: startup sequence
        // 2: check merger permission
        // 3: check ZeroNet login
        // 4: update wallet.json
        // 5: check old session (restore from localStorage)
        // 6: check new session (sessionid just received from MN)
        W2Service.ls_bind(function() {
            W2Service.initialize(true, function (sessionid, save_login) {
                var pgm = controller + ' ls_bind/initialize: ' ;
                console.log(pgm + 'sessionid = ' + sessionid + ',  save_wallet_login = ' +  save_login) ;

                // startup. check if wallet login is saved in:
                // - 1: wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
                // - 2: wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
                // - 3: wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required) + full authorization
                // localStorage: save_wallet_login: '0', '1', '2' or '3'
                self.status.save_login = save_login ;
                console.log(pgm + 'self.status.save_login = ' + self.status.save_login) ;
                if (self.status.save_login == null) {
                    // error
                    self.status.save_login_disabled = false ;
                    return ;
                }
                if (self.status.save_login == '0') {
                    // OK: wallet login is not saved for this cert_user_id in this browser
                    self.status.save_login_disabled = false ;
                    return ;
                }
                // '1': wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage (session is not required)
                // '2': wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
                W2Service.get_wallet_login(self.status.save_login, function(wallet_id, wallet_password, error) {
                    var pgm = controller + ' get_wallet_login callback: ' ;
                    console.log(pgm + 'wallet_id = ' + wallet_id + ', wallet_password = ' + wallet_password + ', error = ' + error) ;
                    if (error) ZeroFrame.cmd("wrapperNotification", ['error', error, 10000]) ;
                    else {
                        self.wallet_id = wallet_id ;
                        self.wallet_password = wallet_password ;
                    }
                    self.status.save_login_disabled = false ;
                    console.log(pgm + 'self.status.save_login_disabled = ' + self.status.save_login_disabled) ;
                    $rootScope.$apply() ;
                    console.log(pgm + 'self.status.save_login_disabled = ' + self.status.save_login_disabled) ;
                }) ; // get_wallet_login callback

            }) ;
        }) ;

        var old_cert_user_id = -1 ;

        self.select_zeronet_cert = function() {
            var pgm = controller + '.select_zeronet_cert: ' ;
            console.log(pgm + 'click');
            ZeroFrame.cmd("certSelect", [["moneynetwork.bit", "nanasi", "zeroid.bit", "kaffie.bit"]], function() {
                var pgm = controller + '.select_zeronet_cert certSelect callback: ' ;
                W2Service.initialize(false);
            });
        };

        // todo: changed ZeroId
        // - cancel current session.
        // - check old session for new cert_user_id. send get_password message
        // - check for new session. new_sessionid and no pubkeys response. send pubkeys message
        // - z_cache. must clear z_cache. new hub, user_path etc
        // - must load any saved wallet into
        self.zeronet_cert_changed = function () {
            var pgm = controller + '.zeronet_cert_changed: ' ;
            if (ZeroFrame.site_info.cert_user_id && (old_cert_user_id == ZeroFrame.site_info.cert_user_id)) return ;
            console.log(pgm + 'old_cert_user_id = ' + old_cert_user_id) ;
            console.log(pgm + 'ZeroFrame.site_info = ' + JSON.stringify(ZeroFrame.site_info));
            console.log(pgm + 'calling check_merger_permission') ;
            W2Service.initialize(false);
        };


        // save wallet login:
        // - 0: No thank you, I will remember wallet login by myself.
        // - 1: Save wallet login in MoneyNetworkW2 (browser/localStorage) encrypted with my ZeroId certificate.
        // - 2: Save wallet login in MoneyNetwork (browser/localStorage) encrypted with my MoneyNetwork password (sessionid is required)
        self.status.save_login = '0' ;
        var old_save_wallet_login = null ; // null: not yet checked

        self.save_login_changed = function() {
            var pgm = controller + '.save_login_changed: ' ;
            if (!ZeroFrame.site_info.cert_user_id) {
                ZeroFrame.cmd("wrapperNodification", ['info', 'Not logged in', 5000]) ;
                self.status.save_login = old_save_wallet_login;
                return ;
            }
            W2Service.save_wallet_login(self.status.save_login, self.wallet_id, self.wallet_password, function(res) {
                console.log(pgm + 'res = ' + JSON.stringify(res)) ;

            }) ;
        }; // save_session_changed

        //permissions = {
        //    "all": true,
        //    "none": true,
        //    "open_wallet": true,
        //    "get_balance": true,
        //    "send_money": true,
        //    "receive_money": true,
        //    "pay": true,
        //    "receive_payment": true,
        //    "close_wallet": true,
        //    "confirm": true
        //};
        var old_permissions = 'x' ;
        self.permissions_changed = function (name) {
            var pgm = controller + '.permissions_changed: ';
            var permissions, i, old_permissions;
            permissions = ['open_wallet', 'get_balance', 'send_money', 'receive_money', 'pay', 'receive_payment', 'close_wallet'];
            // console.log(pgm + 'permissions = ' + JSON.stringify(self.status.permissions) + ', name = ' + JSON.stringify(name));
            if (name == 'all') {
                if (self.status.permissions.all) {
                    for (i = 0; i < permissions.length; i++) {
                        name = permissions[i];
                        self.status.permissions[name] = true;
                    }
                    self.status.permissions.none = false;
                }
            }
            else if (name == 'none') {
                if (self.status.permissions.none) {
                    for (i = 0; i < permissions.length; i++) {
                        name = permissions[i];
                        self.status.permissions[name] = false;
                    }
                    self.status.permissions.all = false;
                }
            }
            else if (name == 'confirm') {
                // no operation
            }
            else if (self.status.permissions[name]) self.status.permissions.none = false;
            else self.status.permissions.all = false;
            if (old_permissions == JSON.stringify(self.status.permissions)) {
                // console.log(pgm + 'no change in permissions') ;
                return ;
            }
            old_permissions = JSON.stringify(self.status.permissions) ;
            // save permissions in ls
            W2Service.save_permissions(function (res) {
                var pgm = controller + '.permissions_changed save_permissions callback: ';
                console.log(pgm + 'res = ' + JSON.stringify(res));
            });

        }; // permissions_changed

        self.add_site = function () {
            var pgm = controller + '.add_site: ' ;
            var text ;
            text = 'Test done and test data deleted?<br>Redirect and add this site to MoneyNetwork?' ;
            ZeroFrame.cmd("wrapperConfirm", [text, "OK"], function (ok) {
                var url ;
                if (!ok) return ;
                url = '/moneynetwork.bit/?path=/wallet?new_wallet_site=' + ZeroFrame.site_info.address ;
                console.log(pgm + 'url = ' + url) ;
                window.location = url ;
            }); // wrapperConfirm

        }; // self.add_site

        // generate random wallet ID and password
        self.gen_wallet_id = function() {
            if (self.wallet_id) {
                ZeroFrame.cmd("wrapperNotification", ["info", 'Old Wallet Id was not replaced', 5000]);
                return ;
            }
            self.wallet_id = W2Service.generate_random_string(30, false) ;
        };
        self.gen_wallet_pwd = function() {
            if (self.wallet_password) {
                ZeroFrame.cmd("wrapperNotification", ["info", 'Old Wallet Password was not replaced', 5000]);
                return ;
            }
            self.wallet_password = W2Service.generate_random_string(30, true) ;
        };


        // wallet status and balance
        self.wallet_info = btcService.get_wallet_info() ;

        // wallet operations
        self.create_new_wallet = function () {
            btcService.create_new_wallet(self.wallet_id, self.wallet_password, function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else {
                    ZeroFrame.cmd("wrapperNotification", ["done", 'New Bitcoin wallet was created OK.<br>Please save backup info<br>See console log', 5000]);
                    $rootScope.$apply() ;
                }
            }) ;
        }; // create_new_wallet

        self.init_wallet = function () {
            btcService.init_wallet(self.wallet_id, self.wallet_password, function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else {
                    ZeroFrame.cmd("wrapperNotification", ["info", 'Bitcoin wallet was initialized OK.', 5000]);
                    $rootScope.$apply() ;
                }
            }) ;
        }; // init_wallet

        self.get_balance = function () {
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            btcService.get_balance(function(error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else $rootScope.$apply() ;
            })
        } ; // get_balance

        self.close_wallet = function () {
            btcService.close_wallet(function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else ZeroFrame.cmd("wrapperNotification", ["info", 'Bitcoin wallet closed', 5000]);
            })
        } ; // close_wallet

        self.delete_wallet = function () {
            btcService.delete_wallet(function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else {
                    ZeroFrame.cmd("wrapperNotification", ["done", 'Bitcoin wallet was deleted', 5000]);
                    // clear form
                    self.wallet_id = null ;
                    self.wallet_password = null ;
                    self.send_address = null ;
                    self.send_amount = null ;
                    self.receiver_address = null ;
                    $rootScope.$apply() ;
                }
            })
        }; // delete_wallet

        self.get_new_address = function () {
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            else self.receiver_address = btcService.get_new_address(function (err, address) {
                if (err) return ZeroFrame.cmd("wrapperNotification", ['error', 'Could not get a new address. error = ' + err]) ;
                else {
                    self.receiver_address = address ;
                    $rootScope.$apply() ;
                }
            }) ;
        }; // get_new_address

        self.send_money = function () {
            var pgm = controller + '.send_money: ' ;
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            if (!self.send_address || !self.send_amount) return ZeroFrame.cmd("wrapperNotification", ["error", "Receiver and/or amount is missing", 5000]) ;
            if (!self.send_amount.match(/^[0-9]+$/)) return ZeroFrame.cmd("wrapperNotification", ["error", "Amount must be an integer (Satoshi)", 5000]) ;
            btcService.send_money(self.send_address, self.send_amount, function (err, result) {
                if (err) {
                    if ((typeof err == 'object') && err.message) err = err.message ;
                    console.log(pgm + 'err = ' + JSON.stringify(err)) ;
                    ZeroFrame.cmd("wrapperNotification", ["error", err]) ;
                }
                else ZeroFrame.cmd("wrapperNotification", ["done", "Money was send. result = " + JSON.stringify(result)]);
            }) ;
        }; // send_money

        // end WalletCtrl
    }])

;