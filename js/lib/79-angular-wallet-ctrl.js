angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['$rootScope', 'MoneyNetworkW2Service', function ($rootScope, moneyNetworkService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

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
            if (self.wallet_info.status != 'Open') return ZeroFrame.cmd("wrapperNotification", ["info", "No bitcoin wallet found", 3000]) ;
            if (!self.send_address || !self.send_amount) return ZeroFrame.cmd("wrapperNotification", ["error", "Receiver and/or amount is missing", 5000]) ;
            if (!self.send_amount.match(/^[0-9]+$/)) return ZeroFrame.cmd("wrapperNotification", ["error", "Amount must be an integer (Satoshi)", 5000]) ;
            moneyNetworkService.send_money(self.send_address, self.send_amount, function (err, result) {
                if (err) ZeroFrame.cmd("wrapperNotification", ["error", err]) ;
                else ZeroFrame.cmd("wrapperNotification", ["done", "Money was send. result = " + JSON.stringify(result)]);
            }) ;


        };

        // end WalletCtrl
    }])

;