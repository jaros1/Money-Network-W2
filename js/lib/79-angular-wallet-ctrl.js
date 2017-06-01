angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['$rootScope', '$timeout', 'MoneyNetworkW2Service', function ($rootScope, $timeout, moneyNetworkService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

        if (moneyNetworkService.is_new_session()) return ; // wait for redirect without sessionid
        var sessionid = moneyNetworkService.get_sessionid() ;
        console.log(controller + ': sessionid = ' + sessionid) ;

        // ZeroNet ID. Only relevant when called as part of Money Network. Not required in standalone test
        self.show_zeronet_id = function () {
            return sessionid ? true : false ;
        };

        self.site_info = {} ;
        var old_cert_user_id = -1 ;
        self.merger_permission = 'n/a' ;
        function check_merger_permission(cb) {
            var pgm = controller + '.check_merger_permission: ' ;
            if (!cb) cb = function (ok) {} ;
            var request1 = function (cb) {
                var pgm = controller + '.check_merger_permission.request1: ' ;
                ZeroFrame.cmd("wrapperPermissionAdd", "Merger:MoneyNetwork", function (res) {
                    console.log(pgm + 'res = ', JSON.stringify(res)) ;
                    if (res == "Granted") {
                        request2(cb) ;
                        self.merger_permission = 'Granted' ;
                    }
                    else cb(false) ;
                }) ;
            } ; // request1
            var request2 = function (cb) {
                var pgm = controller + '.check_merger_permission.request2: ' ;
                ZeroFrame.cmd("mergerSiteAdd", ["1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ"], function (res) {
                    console.log(pgm + 'res = ', JSON.stringify(res)) ;
                    cb((res == 'ok')) ;
                }) ;
            }; // request2
            ZeroFrame.cmd("siteInfo", {}, function (site_info) {
                var pgm = controller + '.check_merger_permission siteInfo callback 1: ' ;
                console.log(pgm + 'old_cert_user_id = ' + old_cert_user_id) ;
                console.log(pgm + 'site_info = ' + JSON.stringify(site_info));
                ZeroFrame.site_info = site_info ;
                self.site_info = site_info ;
                if (old_cert_user_id == -1) old_cert_user_id = site_info.cert_user_id ;

                // console.log(pgm , 'site_info = ' + JSON.stringify(site_info)) ;
                if (site_info.settings.permissions.indexOf("Merger:MoneyNetwork") == -1) {
                    self.merger_permission = 'Missing' ;
                    return request1(cb);
                }
                self.merger_permission = 'Granted' ;
                ZeroFrame.cmd("mergerSiteList", {}, function (merger_sites) {
                    var pgm = controller + '.check_merger_permission mergerSiteList callback 2: ' ;
                    console.log(pgm + 'merger_sites = ', JSON.stringify(merger_sites)) ;
                    if (merger_sites["1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ"] == "MoneyNetwork") cb(true) ;
                    else request2(cb) ;
                }) ; // mergerSiteList callback 2
            }) ; // siteInfo callback 1
        } // check_merger_permission
        check_merger_permission(function (res) {
            var pgm = controller + ' 1: ' ;
            console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
            if (res) {
                console.log(pgm + 'calling save_pubkey2');
                moneyNetworkService.save_pubkey2(function (res) {
                    var pgm = controller + ' 1 save_pubkey2 callback: ' ;
                    console.log(pgm + 'res = ' + JSON.stringify(res));
                }) ;
            }
        }) ;

        self.select_zeronet_cert = function() {
            var pgm = controller + '.select_zeronet_cert: ' ;
            console.log(pgm + 'click');
            ZeroFrame.cmd("certSelect", [["moneynetwork.bit", "nanasi", "zeroid.bit", "kaffie.bit", "moneynetwork"]], function() {
                var pgm = controller + '.select_zeronet_cert certSelect callback: ' ;
                console.log(pgm + 'calling check_merger_permission') ;
                check_merger_permission(function (res) {
                    console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
                }) ;
            });
        };
        self.zeronet_cert_changed = function () {
            var pgm = controller + '.zeronet_cert_changed: ' ;
            if (old_cert_user_id == ZeroFrame.site_info.cert_user_id) return ;
            console.log(pgm + 'old_cert_user_id = ' + old_cert_user_id) ;
            console.log(pgm + 'ZeroFrame.site_info = ' + JSON.stringify(ZeroFrame.site_info));
            console.log(pgm + 'self.site_info = ' + JSON.stringify(self.site_info));
            console.log(pgm + 'calling check_merger_permission') ;
            check_merger_permission(function (res) {
                console.log(pgm + 'check_merger_permission callback: res = ' + JSON.stringify(res));
            }) ;
        };

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
            self.wallet_id = moneyNetworkService.generate_random_string(30, false) ;
        };
        self.gen_wallet_pwd = function() {
            if (self.wallet_password) {
                ZeroFrame.cmd("wrapperNotification", ["info", 'Old Wallet Password was not replaced', 5000]);
                return ;
            }
            self.wallet_password = moneyNetworkService.generate_random_string(30, true) ;
        };


        // wallet status and balance
        self.wallet_info = moneyNetworkService.get_wallet_info() ;

        // wallet operations
        self.create_new_wallet = function () {
            moneyNetworkService.create_new_wallet(self.wallet_id, self.wallet_password, function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else {
                    ZeroFrame.cmd("wrapperNotification", ["done", 'New Bitcoin wallet was created OK.<br>Please save backup info<br>See console log', 5000]);
                    $rootScope.$apply() ;
                }
            }) ;
        };
        self.init_wallet = function () {
            moneyNetworkService.init_wallet(self.wallet_id, self.wallet_password, function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else {
                    ZeroFrame.cmd("wrapperNotification", ["info", 'Bitcoin wallet was initialized OK.', 5000]);
                    $rootScope.$apply() ;
                }
            }) ;
        };
        self.get_balance = function () {
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            moneyNetworkService.get_balance(function(error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else $rootScope.$apply() ;
            })
        } ;
        self.close_wallet = function () {
            moneyNetworkService.close_wallet(function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else ZeroFrame.cmd("wrapperNotification", ["info", 'Bitcoin wallet closed', 5000]);
            })
        } ;
        self.delete_wallet = function () {
            moneyNetworkService.delete_wallet(function (error) {
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
        };

        self.get_new_address = function () {
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            else self.receiver_address = moneyNetworkService.get_new_address(function (err, address) {
                if (err) return ZeroFrame.cmd("wrapperNotification", ['error', 'Could not get a new address. error = ' + err]) ;
                else {
                    self.receiver_address = address ;
                    $rootScope.$apply() ;
                }
            }) ;
        };
        self.send_money = function () {
            var pgm = controller + '.send_money: ' ;
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            if (!self.send_address || !self.send_amount) return ZeroFrame.cmd("wrapperNotification", ["error", "Receiver and/or amount is missing", 5000]) ;
            if (!self.send_amount.match(/^[0-9]+$/)) return ZeroFrame.cmd("wrapperNotification", ["error", "Amount must be an integer (Satoshi)", 5000]) ;
            moneyNetworkService.send_money(self.send_address, self.send_amount, function (err, result) {
                if (err) {
                    if ((typeof err == 'object') && err.message) err = err.message ;
                    console.log(pgm + 'err = ' + JSON.stringify(err)) ;
                    ZeroFrame.cmd("wrapperNotification", ["error", err]) ;
                }
                else ZeroFrame.cmd("wrapperNotification", ["done", "Money was send. result = " + JSON.stringify(result)]);
            }) ;


        };

        // end WalletCtrl
    }])

;