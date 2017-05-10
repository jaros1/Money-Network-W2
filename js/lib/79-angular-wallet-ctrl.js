angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['$rootScope', 'MoneyNetworkW2Service', function ($rootScope, moneyNetworkService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

        function generate_random_string(length, use_special_characters) {
            return MoneyNetworkHelper.generate_random_string(length, use_special_characters) ;
        } // generate_random_string

        self.gen_wallet_id = function() {
            if (self.wallet_id) {
                ZeroFrame.cmd("wrapperNotification", ["info", 'Old Wallet Id was not replaced', 5000]);
                return ;
            }
            self.wallet_id = generate_random_string(30, false) ;
        };
        self.gen_wallet_pwd = function() {
            if (self.wallet_password) {
                ZeroFrame.cmd("wrapperNotification", ["info", 'Old Wallet Password was not replaced', 5000]);
                return ;
            }
            self.wallet_password = generate_random_string(30, true) ;
        };

        self.create_new_wallet = function () {
            moneyNetworkService.create_new_wallet(self.wallet_id, self.wallet_password, function (error) {
                if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
                else ZeroFrame.cmd("wrapperNotification", ["info", 'New Bitcoin wallet was created OK.<br>Please save backup info<br>See console log', 5000]);
            }) ;
        };

        self.delete_wallet = function () {
            moneyNetworkService.delete_wallet(function (error) {
                console.log('error = ' + error) ;
            })
        };




        // end WalletCtrl
    }])

;