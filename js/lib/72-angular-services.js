
angular.module('MoneyNetworkW2')

    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            function create_new_wallet(wallet_id, wallet_password, cb) {
                MoneyNetworkHelper.create_new_wallet(wallet_id, wallet_password, cb) ;
            }
            function init_wallet(wallet_id, wallet_password, cb) {
                MoneyNetworkHelper.init_wallet(wallet_id, wallet_password, cb) ;
            }
            function delete_wallet (cb) {
                MoneyNetworkHelper.delete_wallet(cb) ;
            }

            // export MoneyNetworkW2Service
            return {
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                delete_wallet: delete_wallet
            };

            // end MoneyNetworkW2Service
        }])

;
