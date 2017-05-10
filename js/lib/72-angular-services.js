
angular.module('MoneyNetworkW2')

    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            function create_new_wallet(wallet_id, wallet_password, cb) {
                MoneyNetworkHelper.create_new_wallet(wallet_id, wallet_password, cb) ;
            } // create_new_wallet

            // export MoneyNetworkW2Service
            return {
                create_new_wallet: create_new_wallet
            };

            // end MoneyNetworkW2Service
        }])

;
