angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['$rootScope', '$timeout', 'MoneyNetworkW2Service', 'btcService', function ($rootScope, $timeout, W2Service, btcService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

        if (W2Service.is_new_session()) return ; // wait for redirect without sessionid
        var sessionid = W2Service.get_sessionid() ;
        console.log(controller + ': sessionid = ' + sessionid) ;

        // ZeroNet ID. Only relevant when called as part of Money Network. Not required in standalone test
        self.moneynetwork_session = function () {
            return sessionid ? true : false ;
        };

        self.z = ZeroFrame ;
        var old_cert_user_id = -1 ;

        // check Merger:MoneyNetwork permission. Required for communicating with MoneyNetwork (session)
        self.merger_permission = 'n/a' ;
        function check_merger_permission(cb) {
            var pgm = controller + '.check_merger_permission: ';
            if (!cb) cb = function (ok) {
            };
            var request1 = function (cb) {
                var pgm = controller + '.check_merger_permission.request1: ';
                ZeroFrame.cmd("wrapperPermissionAdd", "Merger:MoneyNetwork", function (res) {
                    console.log(pgm + 'res = ', JSON.stringify(res));
                    if (res == "Granted") {
                        request2(cb);
                        self.merger_permission = 'Granted';
                    }
                    else cb(false);
                });
            }; // request1
            var request2 = function (cb) {
                var pgm = controller + '.check_merger_permission.request2: ';
                W2Service.get_my_user_hub(function (hub) {
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
            if (!ZeroFrame.site_info.cert_user_id) return; // not logged in

            // console.log(pgm , 'site_info = ' + JSON.stringify(site_info)) ;
            if (ZeroFrame.site_info.settings.permissions.indexOf("Merger:MoneyNetwork") == -1) {
                self.merger_permission = 'Missing';
                return request1(cb);
            }
            self.merger_permission = 'Granted';
            ZeroFrame.cmd("mergerSiteList", {}, function (merger_sites) {
                var pgm = controller + '.check_merger_permission mergerSiteList callback 2: ';
                console.log(pgm + 'merger_sites = ', JSON.stringify(merger_sites));
                W2Service.get_my_user_hub(function (hub) {
                    if (merger_sites[hub] == "MoneyNetwork") cb(true);
                    else request2(cb);
                });
            }); // mergerSiteList callback 2
        } // check_merger_permission
        check_merger_permission(function (res) {
            var pgm = controller + ' 1: ' ;
            console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
            if (res) {
                console.log(pgm + 'calling create_session');
                W2Service.create_session(function (res) {
                    var pgm = controller + ' 1 create_session callback: ' ;
                    console.log(pgm + 'res = ' + JSON.stringify(res));
                }) ;
            }
        }) ;

        self.select_zeronet_cert = function() {
            var pgm = controller + '.select_zeronet_cert: ' ;
            console.log(pgm + 'click');
            ZeroFrame.cmd("certSelect", [["moneynetwork.bit", "nanasi", "zeroid.bit", "kaffie.bit"]], function() {
                var pgm = controller + '.select_zeronet_cert certSelect callback: ' ;
                $rootScope.$apply() ;
                console.log(pgm + 'calling check_merger_permission') ;
                check_merger_permission(function (res) {
                    console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
                }) ;
            });
        };
        self.zeronet_cert_changed = function () {
            var pgm = controller + '.zeronet_cert_changed: ' ;
            if (ZeroFrame.site_info.cert_user_id && (old_cert_user_id == ZeroFrame.site_info.cert_user_id)) return ;
            console.log(pgm + 'old_cert_user_id = ' + old_cert_user_id) ;
            console.log(pgm + 'ZeroFrame.site_info = ' + JSON.stringify(ZeroFrame.site_info));
            console.log(pgm + 'calling check_merger_permission') ;
            check_merger_permission(function (res) {
                console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
                if (res) old_cert_user_id = ZeroFrame.site_info.cert_user_id ;
                // $rootScope.$apply() ;
            }) ;
        };


        // save wallet login:
        // - 0: No thank you, I will remember wallet login by myself.
        // - 1: Save wallet login in MoneyNetworkW2 (browser/localStorage) encrypted with my ZeroId certificate.
        // - 2: Save wallet login in MoneyNetwork (browser/localStorage) encrypted with my MoneyNetwork password (sessionid is required)
        self.save_wallet_login = '0' ;
        var old_save_wallet_login = null ; // null: not yet checked

        // startup.
        // - 1: check if wallet login is saved in localStorage encrypted with current ZeroId
        // - 2: session: request wallet login info from MoneyNetwork if any
        // - otherwise: 0: No thank you ....
        // use ls_bind. localStorage may still be loading
        W2Service.ls_bind(function() {
            var pgm = controller + ' ls_bind callback: ' ;
            var ls ;
            if (!ZeroFrame.site_info.cert_user_id) {
                // cannot wallet info without a ZeroNet cert
                self.save_wallet_login = '0' ;
                return ;
            }
            self.save_wallet_login = W2Service.get_save_wallet_login() ;
            console.log(pgm + 'self.save_wallet_login = ' + self.save_wallet_login) ;
            if (self.save_wallet_login == null) return ; // error
            if (self.save_wallet_login == '0') return ; // wallet login is not saved for this cert_user_id in this browser
            // 1: wallet login is saved encrypted (cryptMessage) in MoneyNetworkW2 localStorage
            // 2: wallet login is saved encrypted (symmetric) in MoneyNetwork localStorage (session is required)
            W2Service.get_wallet_login(self.save_wallet_login, function(wallet_id, wallet_password, error) {

            }) ; // get_wallet_login callback

        }) ; // ls_bind callback

        self.save_wallet_login_changed = function() {
            var pgm = controller + '.save_session: ' ;
            if (!ZeroFrame.site_info.cert_user_id) {
                ZeroFrame.cmd("wrapperNodification", ['info', 'Not logged in', 5000]) ;
                self.save_wallet_login = old_save_wallet_login;
                return ;
            }
            if (self.save_wallet_login == old_save_wallet_login) return ;
            console.log(pgm + 'save_session = ' + self.save_wallet_login) ;
            save_login() ;
        }; // save_session_changed

        function save_login () {
            if (old_save_wallet_login != '0') {
                // delete old storage from localStorage

            }
        }


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