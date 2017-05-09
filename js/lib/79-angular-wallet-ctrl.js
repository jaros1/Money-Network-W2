angular.module('MoneyNetworkW2')

    .controller('WalletCtrl', ['MoneyNetworkW2Service', function (moneyNetworkService) {
        var self = this;
        var controller = 'WalletCtrl';
        console.log(controller + ' loaded');

        self.bitcoin_networks = moneyNetworkService.get_bitcoin_networks() ;
        self.bitcoin_network = moneyNetworkService.get_bitcoin_network() ;
        self.network_changed = function () {
            var pgm = controller + '.network_changed: ' ;
            moneyNetworkService.set_bitcoin_network(self.bitcoin_network) ;
            console.log(pgm + 'self.network = ' + JSON.stringify(self.bitcoin_network)) ;
        };

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

        //self.create_new_wallet = function () {
        //    if (!self.wallet_id || !self.wallet_password) {
        //        ZeroFrame.cmd("wrapperNotification", ["error", 'Wallet ID and/or password is missing', 5000]);
        //        return ;
        //    }
        //    moneyNetworkService.create_new_wallet(self.wallet_id, self.wallet_password, function (error) {
        //        if (error) ZeroFrame.cmd("wrapperNotification", ["error", error]);
        //        else ZeroFrame.cmd("wrapperNotification", ["info", 'Wallet was created OK. See backup info in console log', 5000]);
        //    }) ;
        //};

        // xhr workaround: "Origin is not allowed by Access-Control-Allow-Origin"
        // generate, save, run and delete js script
        self.create_new_wallet = function () {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'js-external/61-test.js';
            var tag = document.getElementsByTagName('script')[0];
            tag.parentNode.insertBefore(script, tag);
        };

        self.delete_wallet = function () {
            moneyNetworkService.delete_wallet(function (error) {
                console.log('error = ' + error) ;
            })
        };




        // end WalletCtrl
    }])

;