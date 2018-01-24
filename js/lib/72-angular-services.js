angular.module('MoneyNetworkW2')

    // btcService and MoneyNetworkW2Service
    // abbreviations:
    // - MN - MoneyNetwork - main site
    // - W2 - MoneyNetworkW2 - plugin wallet site with test bitcoins

    // https://coderwall.com/p/ngisma/safe-apply-in-angular-js
    // fixing problems in chatCtrl.approve_money_transactions
    // no error in first approve call. errors in second approve call
    .factory('safeApply', [function($rootScope) {
        return function($scope, fn) {
            var phase = $scope.$root ? $scope.$root.$$phase : null;
            if(phase == '$apply' || phase == '$digest') {
                if (fn) {
                    $scope.$eval(fn);
                }
            } else {
                if (fn) {
                    $scope.$apply(fn);
                } else {
                    $scope.$apply();
                }
            }
        }
    }])

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
                    get_balance(cb) ;
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
                        get_balance(cb);
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

            function get_balance (cb) {
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

            var one_hundred_millions = 100000000 ; // convert between bitcoins and satoshi

            // confirm: true from w2 UI. false in wallet-wallet communication.
            function send_money (address, amount, confirm, cb) {
                var pgm = service + '.send_money: ' ;
                var satoshi, btc, optional_confirm_send_money ;
                if (!bitcoin_wallet) return cb('No bitcoin wallet found') ;
                satoshi = parseInt(amount) ;
                btc = satoshi / one_hundred_millions ;

                optional_confirm_send_money = function (cb) {
                    if (!confirm) return cb() ;
                    ZeroFrame.cmd("wrapperConfirm", ["Send " + satoshi + ' satoshi = ' + btc + ' tBTC<br>to ' + address +"?", "OK"], function (confirm) {
                        if (!confirm) return ; // not confirmed. money was not sent
                        // send money
                        cb() ;
                    }) ;
                } ;
                optional_confirm_send_money(function() {
                    var payment = {} ;
                    payment[address] = satoshi ;
                    bitcoin_wallet.pay(payment, null, false, true, blocktrail.Wallet.FEE_STRATEGY_BASE_FEE, cb) ;
                }) ;

            } // send_money

            function get_transaction (transactionid, cb) {
                init_api_client() ;
                api_client.transaction(transactionid, cb) ;
            } // get_transaction

            // <== https://www.blocktrail.com/api/docs

            // export
            return {
                get_wallet_info: get_wallet_info,
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                get_balance: get_balance,
                close_wallet: close_wallet,
                delete_wallet: delete_wallet,
                get_new_address: get_new_address,
                send_money: send_money,
                get_transaction: get_transaction,
                one_hundred_millions: one_hundred_millions
            };

            // end btcService
        }])


    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location', 'btcService', 'brFilter',
        function ($timeout, $rootScope, $window, $location, btcService, br) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            var service_started_at = new Date().getTime() ;

            // insert <br> into long notifications. For example JSON.stringify
            function z_wrapper_notification (array) {
                array[1] = br(array[1]) ;
                ZeroFrame.cmd("wrapperNotification", array) ;
            } // z_wrapper_notification


            // for MN <=> W2 integration
            var wallet_info = btcService.get_wallet_info() ;
            var one_hundred_millions = btcService.one_hundred_millions ;
            // console.log(service + ': one_hundred_millions = ' + one_hundred_millions) ;

            // localStorage wrapper. avoid some ZeroNet callbacks. cache localStorage in ls hash
            // ls.save_login[auth_address] = { choice: '0', '1', '2' or '3', login: <choice 1: encrypted or unencrypted login> }
            var ls = { is_loading: true } ;
            //ls = [{
            //    "sessions": {
            //        "jro@zeroid.bit": {
            //            "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsOMfAvHPTp0K9qZfoItdJ9898\nU3S2gAZZSLuLZ1qMXr1dEnO8AwxS58UvKGwHObT1XQG8WT3Q1/6OGlJms4mYY1rF\nQXzYEV5w0RlcSrMpLz3+nJ7cVb9lYKOO8hHZFWudFRywkYb/aeNh6mAXqrulv92z\noX0S7YMeNd2YrhqefQIDAQAB\n-----END PUBLIC KEY-----",
            //            "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
            //            "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
            //            "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
            //            "encrypted_info": "[\"UPvLnGUi2vDpTiUqzfzF+QLKACBDFPycbrRSQf3l7neWclOYDguddp7u4kHAWeb+AXpAdgAg89WakZt3zbPIwc5L+8DsrVG8S74APeEvlRCv5bf5WjHYokT70IZylIg/X+QsUNG9biVYsRSUe6s02+AQJCn2Z3BCNoIyvAfuVEym9A+6knyktoS+ZxFNkwMCvJ/Jki5S0OuQkX4aaOlEt8McOvX2HA==\",\"oteCwG24VjKOOUQxz7wGPQ==\",\"TGXeFTOWPpkz/sMFUcNrifinytHHXGck5pJj6OwHK6h99Y7D+QGVlaVysZvlsZRAnMW4FK7MNlXw7FmNqMAVeLca+Uw6ZML+evjtibYy+UyYFUkNvnJZQLfFuMsQopGi\"]",
            //            "prvkey": "U2FsdGVkX1/ICZ/rij1Au+VA02bh4KEs7vla2+j4W5HPPyF0DRRjJIZf7p9FpEl4FXZgxEMlKwBrLhZEERMgYu4XOY0zCsqoWkX9WCu13xi4mhrg8IJtmDtqIujSh5ddjQ8VcxT4unvxCQOGpZ7s8H+/A9sTKm7fAqAzOdLpqMaX7u+QE0FibJGiRh2z7kylsPf1u8KIHWjICBMTuNzEvac1ah58fEVpeQgeRzdRxY4zj2Pa8OJRqeFeLJGMADqimnwGuiZ+kMDsQw2y0XO51wZrVoVY0M7kMVA3Vos1skH1/Ug0TLuyrKGQvZo/V7KhevdlwTj5FT9gPCpimXgBCMl+cFKWUQzkRYKx+OdgKFspMFohjLKJ+ZP5xlfXlziypHhgaBMdT6fXEMSGPtHlPeMGqTOna/GqjmCRuI3tUVoTwpER2ryADbUBlnZY4uBEpFWCmsUHYJgT+I0Yx9ZF/e8Zn9qYSp05APnlqVm0IA5Kl0gQGhJfCjIKeVbVeYmEaPKIe+Jc9eKcNx38AG8dUo85KDI1GQYd7iUdmV59ngSFjmP4goBEzkX/EmFck3oMeVTIahHedkyF/V8gIGQY1ouKCJ6ZyKgB9K2OQ3GqzmMNiMbAG6fklLgBPRJxVXb1jYtVCb2qdzFRKT1S9rGHjssIqYBJEU8XmGXwgUxJZPn4gg8JdFFGh6VodoqdJOhZc9FIHk5/E52cL3X+ZbDouErwGhh9a4+pcoR4zXKhuVx0XOKK8Bnfv9Baxgtjo/1KcpPve93L50U9B7E68ToFvdjyCaVjyf/9UKplYy40cO62p+HdkPRw2bOGo6RrjtVsEsvbXxMRYrPh8mD3k4uZvB4FaV+egLPR/NOPsRS+eHohtZndzMPRVbZqVSts5zNvNGSe5dy+vfvR+REoM3shFqM2hhQCk8LzGYplU0Kq3qJYtTe1R3nyOMzCyqaxNNNmP/wXLSo2O26RcsXJp3d+ABFkxB4MSjPSRqyF7bbJ1Cf2cpqAStrjr57w3nRLc235rUeuDVkEcWdTLw0C+dMVU+WtKOgg5BSxeIDuDuXXYcFMtCD0HFyEgxgOxE4Hx8GXgRj41F6nqBrFSK2U87AQeWmA+fRm5I1hLLi1wpKMxErx1rBT/H3PGdstvF9XEiytZsZI04KVTYM9I5FHm/BPGJqrtemyJS70F6yHQ2e2qrkkb9+MXa+SPF2prj4/qWoI",
            //            "sessionid": "U2FsdGVkX1/hQbcjOztF8NtZk5xb7y+ho/zbceopRMB6g0ok7IjI93PdX6Ip5VS8oOkfQ+xfgudkVLnKI+mhiZzjDlIUqYJi0gdVz+ehLbU="
            //        }
            //    }, "save_login": {"jro@zeroid.bit": "2"}
            //}];
            //ls = [{
            //    "sessions": {
            //        "jro@zeroid.bit": {
            //            "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsOMfAvHPTp0K9qZfoItdJ9898\nU3S2gAZZSLuLZ1qMXr1dEnO8AwxS58UvKGwHObT1XQG8WT3Q1/6OGlJms4mYY1rF\nQXzYEV5w0RlcSrMpLz3+nJ7cVb9lYKOO8hHZFWudFRywkYb/aeNh6mAXqrulv92z\noX0S7YMeNd2YrhqefQIDAQAB\n-----END PUBLIC KEY-----",
            //            "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
            //            "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
            //            "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
            //            "encrypted_info": "[\"UPvLnGUi2vDpTiUqzfzF+QLKACBDFPycbrRSQf3l7neWclOYDguddp7u4kHAWeb+AXpAdgAg89WakZt3zbPIwc5L+8DsrVG8S74APeEvlRCv5bf5WjHYokT70IZylIg/X+QsUNG9biVYsRSUe6s02+AQJCn2Z3BCNoIyvAfuVEym9A+6knyktoS+ZxFNkwMCvJ/Jki5S0OuQkX4aaOlEt8McOvX2HA==\",\"oteCwG24VjKOOUQxz7wGPQ==\",\"TGXeFTOWPpkz/sMFUcNrifinytHHXGck5pJj6OwHK6h99Y7D+QGVlaVysZvlsZRAnMW4FK7MNlXw7FmNqMAVeLca+Uw6ZML+evjtibYy+UyYFUkNvnJZQLfFuMsQopGi\"]",
            //            "prvkey": "U2FsdGVkX1/ICZ/rij1Au+VA02bh4KEs7vla2+j4W5HPPyF0DRRjJIZf7p9FpEl4FXZgxEMlKwBrLhZEERMgYu4XOY0zCsqoWkX9WCu13xi4mhrg8IJtmDtqIujSh5ddjQ8VcxT4unvxCQOGpZ7s8H+/A9sTKm7fAqAzOdLpqMaX7u+QE0FibJGiRh2z7kylsPf1u8KIHWjICBMTuNzEvac1ah58fEVpeQgeRzdRxY4zj2Pa8OJRqeFeLJGMADqimnwGuiZ+kMDsQw2y0XO51wZrVoVY0M7kMVA3Vos1skH1/Ug0TLuyrKGQvZo/V7KhevdlwTj5FT9gPCpimXgBCMl+cFKWUQzkRYKx+OdgKFspMFohjLKJ+ZP5xlfXlziypHhgaBMdT6fXEMSGPtHlPeMGqTOna/GqjmCRuI3tUVoTwpER2ryADbUBlnZY4uBEpFWCmsUHYJgT+I0Yx9ZF/e8Zn9qYSp05APnlqVm0IA5Kl0gQGhJfCjIKeVbVeYmEaPKIe+Jc9eKcNx38AG8dUo85KDI1GQYd7iUdmV59ngSFjmP4goBEzkX/EmFck3oMeVTIahHedkyF/V8gIGQY1ouKCJ6ZyKgB9K2OQ3GqzmMNiMbAG6fklLgBPRJxVXb1jYtVCb2qdzFRKT1S9rGHjssIqYBJEU8XmGXwgUxJZPn4gg8JdFFGh6VodoqdJOhZc9FIHk5/E52cL3X+ZbDouErwGhh9a4+pcoR4zXKhuVx0XOKK8Bnfv9Baxgtjo/1KcpPve93L50U9B7E68ToFvdjyCaVjyf/9UKplYy40cO62p+HdkPRw2bOGo6RrjtVsEsvbXxMRYrPh8mD3k4uZvB4FaV+egLPR/NOPsRS+eHohtZndzMPRVbZqVSts5zNvNGSe5dy+vfvR+REoM3shFqM2hhQCk8LzGYplU0Kq3qJYtTe1R3nyOMzCyqaxNNNmP/wXLSo2O26RcsXJp3d+ABFkxB4MSjPSRqyF7bbJ1Cf2cpqAStrjr57w3nRLc235rUeuDVkEcWdTLw0C+dMVU+WtKOgg5BSxeIDuDuXXYcFMtCD0HFyEgxgOxE4Hx8GXgRj41F6nqBrFSK2U87AQeWmA+fRm5I1hLLi1wpKMxErx1rBT/H3PGdstvF9XEiytZsZI04KVTYM9I5FHm/BPGJqrtemyJS70F6yHQ2e2qrkkb9+MXa+SPF2prj4/qWoI",
            //            "sessionid": "U2FsdGVkX1/hQbcjOztF8NtZk5xb7y+ho/zbceopRMB6g0ok7IjI93PdX6Ip5VS8oOkfQ+xfgudkVLnKI+mhiZzjDlIUqYJi0gdVz+ehLbU="
            //        }
            //    }, "save_login": {"jro@zeroid.bit": "2"}
            //}];

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
                var pgm = service + '.ls_loaded: ' ;
                var wait_for_site_info, key, cb ;
                wait_for_site_info = function() { ls_loaded(res) };
                if (!ZeroFrame.site_info) {
                    $timeout(wait_for_site_info, 500) ;
                    return ;
                }
                // siteInfo is ready
                for (key in res) ls[key] = res[key] ;
                // console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;

                // migrate to newest ls structure
                if (ls.transactions) {
                    // rename transactions to w_sessions
                    ls.w_sessions = ls.transactions ;
                    delete ls.transactions ;
                }
                if (ls.sessions) {
                    // rename sessions to mn_sessions
                    ls.mn_sessions = ls.sessions ;
                    delete ls.sessions ;
                }

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
                var pgm = service + '.ls_save: ' ;
                // console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;
                ZeroFrame.cmd("wrapperSetLocalStorage", [ls], function () {}) ;
            } // ls_save

            // setup MoneyNetworkAPI
            // MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f]{10}.[0-9]{13}$"}) ; // global options
            // MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]$"}) ; // global options
            MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^.*-.*$"}) ; // global options

            // inject extra json schemas into MoneyNetworkAPI (internal wallet to wallet communication)
            var extra_json_schemas = {

                "w2_pubkeys": {
                    "type": 'object',
                    "title": 'Send pubkeys (JSEncrypt and cryptMessage) to other wallet session',
                    "description": 'Sent from send_mt and start_mt post processing',
                    "properties": {
                        "msgtype": {"type": 'string', "pattern": '^w2_pubkeys$'},
                        "pubkey": {"type": 'string'},
                        "pubkey2": {"type": 'string'}
                    },
                    "required": ['msgtype', 'pubkey', 'pubkey2'],
                    "additionalProperties": false
                }, // w2_pubkeys

                "w2_check_mt": {
                    "type": 'object',
                    "title": 'Return bitcoin addresses and check money transactions',
                    "description": 'From receiver to sender. Workflow: pubkeys => w2_check_mt. Use this message to exchange bitcoin addresses and crosscheck money transaction information. Identical=execute transactions. Different=abort transactions',
                    "properties": {
                        "msgtype": { "type": 'string', "pattern": '^w2_check_mt$'},
                        "money_transactions": {
                            "type": 'array',
                            "items": {
                                "type": 'object',
                                "properties": {
                                    "action": { "type": 'string', "pattern": '^(Send|Request)$'},
                                    "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                    "amount": {"type": ['number', 'string'], "description": 'number or string with a formatted number (number.toFixed)'},
                                    "json": {
                                        "type": 'object',
                                        "properties": {
                                            "address": { "type": 'string'},
                                            "return_address": { "type": 'string'}
                                        },
                                        "required": ['address', 'return_address'],
                                        "additionalProperties": false
                                    }
                                },
                                "required": ['action', 'code', 'amount', 'json'],
                                "additionalProperties": false
                            },
                            "minItems": 1
                        }
                    },
                    "required": ['msgtype', 'money_transactions'],
                    "additionalProperties": false
                }, // w2_check_mt

                "w2_start_mt": {
                    "type": 'object',
                    "title": 'start or abort money transactions',
                    "description": 'From sender to receiver. Workflow: w2_check_mt => w2_start_mt. Start or abort money transaction',
                    "properties": {
                        "msgtype": { "type": 'string', "pattern": '^w2_start_mt$'},
                        "pay_results": {
                            "type": 'array',
                            "items": { "type": ['undefined','null','string']},
                            "description": 'null (receiver is sending), bitcoin transactionid or an error message). One row with each row in w2_check_mt.money_transactions array',
                            "minItems": 1
                        },
                        "error": { "type": 'string', "description": 'w2_check_mt errors. Inconsistency between transaction in the two wallets.'}
                    },
                    "required": ['msgtype'],
                    "additionalProperties": false
                }, // w2_start_mt

                "w2_end_mt": {
                    "type": 'object',
                    "title": 'end or abort money transactions',
                    "description": 'From receiver to sender. Workflow: w2_start_mt => w2_end_mt. End (pay_results) or abort money transaction (error)',
                    "properties": {
                        "msgtype": { "type": 'string', "pattern": '^w2_end_mt$'},
                        "pay_results": {
                            "type": 'array',
                            "items": { "type": ['undefined','null','string']},
                            "description": 'null (sender is sending) or btc.pay result (transaction id or error message). One row with each row in w2_check_mt.money_transactions array',
                            "minItems": 1
                        },
                        "error": { "type": 'string', "description": 'w2_start_mt errors. Inconsistency between w2_start_mt and saved transaction info'}
                    },
                    "required": ['msgtype'],
                    "additionalProperties": false
                }, // w2_end_mt

                "w2_cleanup_mt": {
                    "type": 'object',
                    "title": 'cleanup file and data after completed or aborted money transaction',
                    "description": 'From sender to to receiver. Workflow: w2_end_mt => w2_cleanup_mt. Cleanup data in file system and in Ls',
                    "properties": {
                        "msgtype": { "type": 'string', "pattern": '^w2_cleanup_mt$'},
                        "error": { "type": 'string', "description": 'w2_end_mt errors. Inconsistency between w2_end_mt and saved transaction info'}
                    },
                    "required": ['msgtype'],
                    "additionalProperties": false
                } // w2_cleanup_mt

            } ;
            MoneyNetworkAPILib.add_json_schemas(extra_json_schemas, 'w2') ;

            // message workflow between sender of money transaction(s) and receiver of money transaction(s)
            var message_workflow = {
                sender: {
                    start: 'w2_pubkeys',        // 1: send_mt             => send w2_pubkeys
                    w2_check_mt: 'w2_start_mt', // 3: receive w2_check_mt => send w2_start_mt
                    w2_end_mt: 'w2_cleanup_mt'  // 5: receive w2_end_mt   => send w2_cleanup_mt
                },
                receiver: {
                    start: 'w2_pubkeys',        // 1: start_mt            => send w2_pubkeys
                    w2_pubkeys: 'w2_check_mt',  // 2: receive w2_pubkeys  => send w2_check_mt
                    w2_start_mt: 'w2_end_mt',   // 4: receive w2_start_mt => send w2_end_mt
                    w2_cleanup_mt: 'end'        // 6: receive w2_cleanup_mt
                }
            } ;

            var encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ; // encrypt1. no sessionid. self encrypt/decrypt data in W2 localStorage ;

            // save_wallet_login:
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2' & '3': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function get_wallet_login(save_wallet_login, cb) {
                var pgm = service + '.get_wallet_login: ' ;
                var error, auth_address, user_login_info, login, encrypted_json, request ;
                if (['1','2'].indexOf(save_wallet_login) == -1) return cb(null, null, "Invalid call. save_wallet_login must be equal '1' or '2'") ;
                if (save_wallet_login == '1') {
                    // wallet login is saved encrypted (cryptMessage) in W2 localStorage
                    if (!ls.save_login) return cb(null, null, 'save_login hash was not found in localStorage') ;
                    if (typeof ls.save_login != 'object') {
                        error = 'save_login was not a hash. save_login = ' + JSON.stringify(ls.save_login) ;
                        ls.save_login = {} ;
                        ls_save() ;
                        return cb(null, null, error) ;
                    }
                    auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                    user_login_info = ls.save_login[auth_address] ;
                    if (!user_login_info) return cb(null, null, 'Wallet login for ' + auth_address + ' was not found') ;
                    if (auth_address == 'n/a') {
                        // no ZeroNet certificate. login is saved unencrypted in ls
                        login = user_login_info.login ;
                        console.log(pgm + 'unencrypted login = ' + JSON.stringify(login)) ;
                        if (!login) return cb(null, null, 'Wallet login for ' + auth_address + ' was not found') ;
                        if (typeof login != 'object') {
                            error = 'save_login[' + auth_address + '].login is not a hash. save_login = ' + JSON.stringify(login) ;
                            user_login_info.login = {} ;
                            ls_save() ;
                            return cb(null, null, error) ;
                        }
                        status.wallet_id = login.wallet_id ;
                        status.wallet_password = login.wallet_password ;
                        return cb(status.wallet_id, status.wallet_password, null) ;
                        setTimeout(load_w_sessions, 0) ;
                    }
                    // ZeroNet certificate present. decrypt login
                    encrypted_json = user_login_info.login ;
                    console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                    encrypt1.decrypt_json(encrypted_json, {}, function(json) {
                        var pgm = service + '.get_wallet_login decrypt_json callback: ' ;
                        console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                        if (!json) cb(null, null, 'decrypt error. encrypted_json was ' + JSON.stringify(user_login_info)) ;
                        else {
                            status.wallet_id = json.wallet_id ;
                            status.wallet_password = json.wallet_password ;
                            cb(status.wallet_id, status.wallet_password, null) ;
                            setTimeout(load_w_sessions, 0) ;
                        }
                    }) ; // decrypt_json callback
                }
                else {
                    // save_wallet_login == '2' or '3'
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
                            try {
                                encrypted_json = JSON.parse(encrypted_row.value) ;
                            }
                            catch (e) {
                                console.log(pgm + 'error. invalid data response. value was not a json string. value = ' + encrypted_row.value + ', error = ' + e.message);
                                data.push({key: encrypted_row.key, value: null}) ;
                                return decrypt_row(cb2) ;
                            }
                            encrypt1.decrypt_json(encrypted_json, {}, function (decrypted_json) {
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
                            status.wallet_id = data[0].value.wallet_id ;
                            status.wallet_password = data[0].value.wallet_password ;
                            cb(status.wallet_id, status.wallet_password, null);
                            setTimeout(load_w_sessions, 0) ;
                        }) ; // decrypt_row callback

                    }) ; // send_message callback
                }
            } // get_wallet_login


            // save_wallet_login:
            // - '0': no thank you. Clear any wallet data previously saved with '1' or '2'
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function save_wallet_login(save_wallet_login, wallet_id, wallet_password, cb) {
                var pgm = service + '.save_wallet_login: ';
                var cert_user_id, auth_address, data, request, old_login, save_w2;
                console.log(pgm + 'save_wallet_login = ' + save_wallet_login + ', wallet_id = ' + wallet_id + ', wallet_password = ' + wallet_password);
                if (['0', '1', '2', '3'].indexOf(save_wallet_login) == -1) return cb({error: "Invalid call. save_wallet_login must be equal '0', '1', '2' or '3'"});

                // save wallet login choice in W2 localStorage (choice = 0, 1, 2 or 3
                cert_user_id = ZeroFrame.site_info.cert_user_id ;
                auth_address = cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                if (!ls.save_login) ls.save_login = {};
                if (cert_user_id && ls.save_login[cert_user_id]) delete ls.save_login[cert_user_id] ; // old index
                if (!ls.save_login[auth_address]) ls.save_login[auth_address] = {};
                if (typeof ls.save_login[auth_address] != 'object') {
                    console.log(pgm + 'error. ls.save_login[auth_address] was not a hash. ls.save_login[auth_address] = ' + JSON.stringify(ls.save_login[auth_address])) ;
                    ls.save_login[auth_address] = {} ;
                }
                old_login = JSON.parse(JSON.stringify(ls.save_login[auth_address]));
                ls.save_login[auth_address].choice = save_wallet_login;
                console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;
                ls_save();

                // for get_balance request
                status.wallet_id = wallet_id ;
                status.wallet_password = wallet_password ;
                setTimeout(load_w_sessions, 0) ;

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
                            delete ls.save_login[auth_address].login;
                            ls_save();
                            return cb();
                        }
                        // save login info in W2 localStorage
                        if (auth_address == 'n/a') {
                            // no cert_user_id. not encrypted
                            ls.save_login[auth_address].login = {
                                wallet_id: wallet_id,
                                wallet_password: wallet_password
                            };
                            ls_save();
                            return cb();
                        }
                        // cert_user_id: encrypt login
                        unencrypted_login = {wallet_id: wallet_id, wallet_password: wallet_password};
                        console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);
                        encrypt1.encrypt_json(unencrypted_login, {encryptions: [2]}, function (encrypted_login) {
                            ls.save_login[auth_address].login = encrypted_login;
                            ls_save();
                            return cb();
                        });
                    }; // save_w2

                    save_w2(function () {
                        var pgm = service + '.save_wallet_login save_w2 callback 2: ';
                        // update MN localStorage (choice '2' and '3')
                        if (['2', '3'].indexOf(save_wallet_login) != -1) {
                            if (!status.sessionid) {
                                ls.save_login[auth_address] = old_login;
                                return cb({error: 'Error. Cannot save wallet information in MN. MN session was not found'});
                            }
                            // encrypt wallet data before sending data to MN
                            data = {wallet_id: wallet_id, wallet_password: wallet_password};
                            console.log(pgm + 'data = ' + JSON.stringify(data));
                            // cryptMessage encrypt data with current ZeroId before sending data to MN.
                            // encrypt data before send save_data message
                            encrypt1.encrypt_json(data, {encryptions: [2]}, function (encrypted_data) {
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
                                    else cb({}); // OK. login saved in MN
                                }); // send_message callback 4
                            }); // encrypt_json callback 3

                        }
                        else {
                            // 0 or 1. clear old 2
                            if (!status.sessionid) return cb({}); // error: 'Cannot clear wallet information. MN session was not found'
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

            // MN-W2 session. only relevant if W2 is called from MN with a sessionid or an old still working MN-W2 session can be found in localStorage
            // session status: use at startup and after changing/selecting ZeroId
            var status = {
                old_cert_user_id: -1,
                sessionid: null,
                merger_permission: 'n/a', // checking Merger:MoneyNetwork permission
                session_handshake: 'n/a', // checking old/new session
                save_login: '0', // radio group '0', '1' (W2 LS) or '2' (MN LS)
                save_login_disabled: true, // radio group disabled while checking save_wallet_login status
                permissions: {}, // MoneyNetwork permissions to wallet operations
                offline: [] // array with offline outgoing money transaction
            } ;
            function get_status () { return status }

            // get permissions from ls (rules for MoneyNetwork wallet operations)
            function get_permissions (cb) {
                var pgm = service + '.get_permissions: ' ;
                var error, auth_address, user_info, permissions, encrypted_json, key ;
                if (!ls.save_login) return cb('save_login hash was not found in localStorage') ;
                if (typeof ls.save_login != 'object') {
                    error = 'save_login was not a hash. save_login = ' + JSON.stringify(ls.save_login) ;
                    ls.save_login = {} ;
                    ls_save() ;
                    for (key in status.permissions) delete status.permissions[key] ;
                    return cb(error) ;
                }
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                user_info = ls.save_login[auth_address] ;
                if (!user_info) return cb('User info for ' + auth_address + ' was not found') ;
                if (auth_address == 'n/a') {
                    // no ZeroNet certificate. login is saved unencrypted in ls
                    permissions = user_info.permissions ;
                    // console.log(pgm + 'unencrypted permissions = ' + JSON.stringify(permissions)) ;
                    if (!permissions) return cb('Permissions for ' + auth_address + ' was not found') ;
                    if (typeof permissions != 'object') {
                        error = 'save_login[' + auth_address + '].permissions is not a hash. permissions = ' + JSON.stringify(permissions) ;
                        user_info.permissions = {} ;
                        ls_save() ;
                        for (key in status.permissions) delete status.permissions[key] ;
                        return cb(error) ;
                    }
                    // copy permissions to status (used in UI)
                    for (key in status.permissions) delete status.permissions[key] ;
                    for (key in permissions) status.permissions[key] = permissions[key] ;
                    // console.log(pgm + 'status.permissions = ' + JSON.stringify(status.permissions));
                    return cb(null) ;
                }
                // ZeroNet certificate present. decrypt permissions
                encrypted_json = user_info.permissions ;
                // console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                if (!encrypted_json) return cb('No encrypted permissions was found for ' + auth_address) ;
                encrypt1.decrypt_json(encrypted_json, {}, function(json) {
                    var pgm = service + '.get_permissions decrypt_json callback: ' ;
                    var key ;
                    // console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                    if (!json) {
                        for (key in status.permissions) delete status.permissions[key] ;
                        cb('decrypt error. encrypted_json was ' + JSON.stringify(encrypted_json)) ;
                    }
                    else {
                        // copy permissions to status (used in UI)
                        for (key in status.permissions) delete status.permissions[key] ;
                        for (key in json) status.permissions[key] = json[key] ;
                        // console.log(pgm + 'status.permissions = ' + JSON.stringify(status.permissions));
                        cb(null) ;
                    }
                }) ; // decrypt_json callback
            } // get_permissions

            // save permissions in ls (rules for MoneyNetwork wallet operations)
            function save_permissions (cb) {
                var pgm = service + '.save_permissions: ' ;
                var auth_address, unencrypted_permissions ;
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                if (auth_address == 'n/a') {
                    // no cert_user_id. not encrypted
                    ls.save_login[auth_address].permissions = JSON.parse(JSON.stringify(status.permissions)) ;
                    ls_save();
                    return cb();
                }
                // get and add W2 pubkey2 to encryption setup (self encrypt using ZeroNet certificate)
                get_my_pubkey2(function (my_pubkey2) {
                    var pgm = service + '.save_permissions get_my_pubkey2 callback 1: ';
                    var save_w2;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2});
                    // console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);

                    // cert_user_id: encrypt permissions
                    unencrypted_permissions = status.permissions;
                    // console.log(pgm + 'unencrypted_permissions = ' + JSON.stringify(unencrypted_permissions)) ;
                    encrypt1.encrypt_json(unencrypted_permissions, {encryptions: [2]}, function (encrypted_permissions) {
                        var pgm = service + '.save_permissions encrypt_json callback 2: ';
                        ls.save_login[auth_address].permissions = encrypted_permissions;
                        // console.log(pgm + 'encrypted_permissions = ' + JSON.stringify(encrypted_permissions)) ;
                        ls_save();
                        return cb();
                    }); // encrypt_json callback 2

                }) ; // get_my_pubkey2 callback 1

            } // save_permissions

            // todo: changed ZeroId. clear z_cache.
            var z_cache = {} ; // cache some ZeroNet objects: wallet_data_hub, wallet.json

            // fix "Merger site (MoneyNetwork) does not have permission for merged site: xxx" errors
            // wait for mergerSiteAdd event to finish. see todo: xxxx
            var new_wallet_hub_cbs = {} ; // hub => array with (fileGet) callbacks waiting for hub to be ready

            // demon. dbQuery. check for any json for new wallet data wallet hub before running any fileGet operations
            function monitor_first_hub_event () {
                var pgm = service + '.monitor_first_hub_event: ' ;
                var w2_query_1, debug_seq ;
                if (!Object.keys(new_wallet_hub_cbs).length) return ; // no more new wallet hubs to monitor

                w2_query_1 =
                    "select substr(directory, 1, instr(directory,'/')-1) as hub, count(*) as rows " +
                    "from json " +
                    "group by substr(directory, 1, instr(directory,'/')-1);" ;
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 1', 'dbQuery') ;
                ZeroFrame.cmd("dbQuery", [w2_query_1], function (res) {
                    var pgm = service + '.monitor_first_hub_event dbQuery callback: ';
                    var hub, i, cbs, cb;
                    // if (detected_client_log_out(pgm)) return ;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK');
                    if (res.error) {
                        console.log(pgm + "first hub lookup failed: " + res.error);
                        console.log(pgm + 'w2 query 1 = ' + w2_query_1);
                        for (hub in new_wallet_hub_cbs) console.log(pgm + 'error: ' + new_wallet_hub_cbs[hub].length + ' callbacks are waiting forever for hub ' + hub) ;
                        return ;
                    }
                    for (i=0 ; i<res.length ; i++) {
                        hub = res[i].hub ;
                        if (!new_wallet_hub_cbs[hub]) continue ;
                        console.log(pgm + 'new user data hub ' + hub + ' is ready. ' + new_wallet_hub_cbs[hub].length + ' fileGet operations are waiting in callback queue. running callbacks now') ;
                        // move to temporary cbs array
                        cbs = [] ;
                        while (new_wallet_hub_cbs[hub].length) {
                            cb = new_wallet_hub_cbs[hub].shift() ;
                            cbs.push(cb) ;
                        }
                        delete new_wallet_hub_cbs[hub] ;
                        // run cbs
                        while (cbs.length) {
                            cb = cbs.shift() ;
                            cb() ;
                        }
                    }
                    $timeout(monitor_first_hub_event, 250) ;
                }) ; // dbQuery callback

            } // monitor_first_hub_event

            // ZeroFrame wrappers.
            function z_file_get (pgm, options, cb) {
                MoneyNetworkAPILib.z_file_get(pgm, options, cb);
            } // z_file_get
            function z_file_write (pgm, inner_path, content, cb) {
                MoneyNetworkAPILib.z_file_write(pgm, inner_path, content, {}, cb);
            } // z_file_get


            function get_default_wallet_hub () {
                var pgm = service + '.get_default_wallet_hub: ' ;
                var default_wallet_hub, default_hubs, hub, hubs, i ;
                default_wallet_hub = {hub: '1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ', title: 'W2 Wallet data hub'} ;
                console.log(pgm + 'ZeroFrame.site_info.content = ' + JSON.stringify(ZeroFrame.site_info.content));
                default_hubs = ZeroFrame.site_info.content.settings.default_hubs ;
                if (!default_hubs) return default_wallet_hub ;
                hubs = [] ;
                for (hub in default_hubs) hubs.push({hub: hub, title: default_hubs[hub].title}) ;
                if (!hubs.length) return default_wallet_hub ;
                i = Math.floor(Math.random() * hubs.length);
                return hubs[i] ;
            } // get_default_wallet_hub
            
            var get_my_wallet_hub_cbs = [] ; // callbacks waiting for query 17 to finish
            function get_my_wallet_hub (cb) {
                var pgm = service + '.get_my_wallet_hub: ' ;
                var debug_seq0 ;
                if (z_cache.my_wallet_data_hub == true) {
                    // get_my_wallet_hub request is already running. please wait
                    get_my_wallet_hub_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.my_wallet_data_hub) return cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub, z_cache.other_wallet_data_hub_title) ;
                z_cache.my_wallet_data_hub = true ;

                // get a list of MN wallet data hubs
                // ( MN merger sites with title starting with "W2 ")
                debug_seq0 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'mergerSiteList') ;
                ZeroFrame.cmd("mergerSiteList", [true], function (merger_sites) {
                    var pgm = service + '.get_my_wallet_hub mergerSiteList callback 1: ' ;
                    var wallet_data_hubs, hub, w2_query_2, debug_seq1, i ;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq0, merger_sites ? 'OK': 'Failed');
                    wallet_data_hubs = [] ;
                    if (!merger_sites || merger_sites.error) console.log(pgm + 'mergerSiteList failed. merger_sites = ' + JSON.stringify(merger_sites)) ;
                    else for (hub in merger_sites) {
                        if (merger_sites[hub].content.title.match(/^W2 /i)) {
                            wallet_data_hubs.push({hub: hub, title: merger_sites[hub].content.title});
                        }
                    }
                    console.log(pgm + 'wallet_data_hubs = ' + JSON.stringify(wallet_data_hubs));
                    // user_data_hubs = ["1PgyTnnACGd1XRdpfiDihgKwYRRnzgz2zh","1922ZMkwZdFjKbSAdFR1zA5YBHMsZC51uc"]

                    // find wallet data hub for current user
                    // - wallet.json file most exist
                    // - wallet.wallet_address = this site
                    // - latest updated content.json is being used
                    w2_query_2 =
                        "select substr(wallet.directory, 1, instr(wallet.directory,'/')-1) as hub " +
                        "from keyvalue as wallet_address, json as wallet, json as content, keyvalue as modified " +
                        "where wallet_address.key = 'wallet_address' " +
                        "and wallet_address.value = '" + ZeroFrame.site_info.address + "' " +
                        "and wallet.json_id = wallet_address.json_id " +
                        "and wallet.directory like '%/" + ZeroFrame.site_info.auth_address + "' " +
                        "and content.directory = wallet.directory " +
                        "and content.file_name = 'content.json' " +
                        "and modified.json_id = content.json_id " +
                        "and modified.key = 'modified' " +
                        "order by modified.value desc" ;

                    console.log(pgm + 'w2 query 2 = ' + w2_query_2);
                    debug_seq1 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 2', 'dbQuery') ;
                    ZeroFrame.cmd("dbQuery", [w2_query_2], function (res) {
                        var pgm = service + '.get_my_wallet_hub dbQuery callback 2: ' ;
                        var i, run_callbacks, wallet_hub_selected, get_and_add_default_wallet_hub ;
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq1, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + res.length + ' rows');

                        run_callbacks = function () {
                            var pgm = service + '.get_my_wallet_hub.run_callbacks: ' ;
                            var set_disabled_job ;
                            console.log(pgm + 'my_wallet_hub = ' + z_cache.my_wallet_data_hub +
                                ', other_wallet_hub = ' + z_cache.other_wallet_data_hub +
                                ', other_wallet_data_hub_title = ' + z_cache.other_wallet_data_hub_title) ;

                            // prevent user from removing user data hub with user data.
                            set_disabled_job = function () { MoneyNetworkAPILib.all_hubs_set_disabled(z_cache.my_wallet_data_hub) } ;
                            $timeout(set_disabled_job) ;

                            cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub, z_cache.other_wallet_data_hub_title) ;
                            while (get_my_wallet_hub_cbs.length) {
                                cb = get_my_wallet_hub_cbs.shift() ;
                                cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub, z_cache.other_wallet_data_hub_title)
                            }
                        }; // run_callbacks

                        wallet_hub_selected = function () {
                            // user data hub was selected. find a random other user data hub. For user data hub lists. written to data.json file
                            var pgm = service + '.get_my_wallet_hub.wallet_hub_selected: ' ;
                            var other_wallet_data_hubs ;
                            if (wallet_data_hubs.length <= 1) {
                                z_cache.other_wallet_data_hub = z_cache.my_wallet_data_hub ;
                                return run_callbacks() ;
                            }
                            other_wallet_data_hubs = [] ;
                            for (i=0 ; i<wallet_data_hubs.length ; i++) {
                                if (wallet_data_hubs[i].hub != z_cache.my_wallet_data_hub) other_wallet_data_hubs.push(wallet_data_hubs[i]) ;
                            }
                            i = Math.floor(Math.random() * other_wallet_data_hubs.length);
                            z_cache.other_wallet_data_hub = other_wallet_data_hubs[i].hub ;
                            z_cache.other_wallet_data_hub_title = other_wallet_data_hubs[i].title ;
                            return run_callbacks() ;
                        }; // wallet_hub_selected

                        get_and_add_default_wallet_hub = function () {
                            var pgm = service + '.get_my_wallet_hub.get_and_add_default_wallet_hub: ' ;
                            var my_wallet_data_hub, debug_seq ;
                            // no wallet_data_hubs (no merger site hubs were found)
                            my_wallet_data_hub = get_default_wallet_hub() ;
                            console.log(pgm + 'my_wallet_data_hub = ' + my_wallet_data_hub) ;
                            debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'mergerSiteAdd') ;
                            MoneyNetworkAPILib.z_merger_site_add(my_wallet_data_hub, function (res) {
                                var pgm = service + '.get_my_wallet_hub.get_and_add_default_wallet_hub z_merger_site_add callback: ' ;
                                MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res ? 'OK' : 'Failed');
                                console.log(pgm + 'res = '+ JSON.stringify(res));
                                if (res == 'ok') {
                                    z_cache.my_wallet_data_hub = my_wallet_data_hub.hub ;
                                    wallet_hub_selected() ;
                                    return ;
                                }
                                console.log(pgm + 'mergerSiteAdd failed. hub = ' + my_wallet_data_hub + '. error = ' + res) ;

                            }) ;
                        }; // get_and_add_default_wallet_hub

                        if (res.error) {
                            console.log(pgm + "wallet data hub lookup failed: " + res.error);
                            console.log(pgm + 'w2 query 2 = ' + w2_query_2);
                            return get_and_add_default_wallet_hub() ;
                        }
                        if (res.length) {
                            // old wallet
                            z_cache.my_wallet_data_hub = res[0].hub ; // return hub for last updated content.json
                            return wallet_hub_selected() ;
                        }
                        // new wallet. get wallet data hub from
                        // 1) list of MN merger sites (mergerSiteList)
                        // 2) default_hubs from site_info.content.sessions.default_hubs
                        if (wallet_data_hubs.length) {
                            i = Math.floor(Math.random() * wallet_data_hubs.length);
                            z_cache.my_wallet_data_hub = wallet_data_hubs[i].hub ;
                            console.log(pgm + 'hub = ' + z_cache.my_wallet_data_hub) ;
                            wallet_hub_selected() ;
                        }
                        else get_and_add_default_wallet_hub() ;
                    }) ; // dbQuery callback 2

                }) ; // mergerSiteList callback 1

            } // get_my_wallet_hub

            function get_merged_type () {
                return MoneyNetworkAPILib.get_merged_type() ;
            }

            // return special merger site path
            var get_user_path_cbs = [] ;
            function get_user_path (cb) {
                var pgm = service + '.user_path: ' ;
                if (!ZeroFrame.site_info) throw pgm + "invalid call. ZeroFrame is not finish loading" ;
                if (!ZeroFrame.site_info.cert_user_id) throw pgm + "invalid call. ZeroId is missing" ;
                if (z_cache.user_path == true) {
                    // wait for previous user_path request to finish
                    get_user_path_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.user_path) return cb(z_cache.user_path) ; // OK
                z_cache.user_path = true ;
                get_my_wallet_hub(function (my_hub, other_wallet_data_hub, other_wallet_data_hub_title) {
                    z_cache.user_path = 'merged-' + get_merged_type() + '/' + my_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' ;
                    MoneyNetworkAPILib.config({this_user_path: z_cache.user_path}) ;
                    cb(z_cache.user_path);
                    while (get_user_path_cbs.length) { cb = get_user_path_cbs.shift() ; cb(z_cache.user_path)}
                }) ;
            } // get_user_path

            // initialize. delete old status.json file - no longer needed
            function delete_status_json (cb) {
                var pgm = service + '.delete_status_json: ' ;
                get_my_wallet_hub(function (my_hub, other_wallet_data_hub, other_wallet_data_hub_title) {
                    var pgm = service + '.delete_status_json get_my_wallet_hub callback 1: ' ;
                    var directory, w2_query_8, debug_seq ;
                    directory = my_hub + '/data/users/' + ZeroFrame.site_info.auth_address ;
                    w2_query_8 =
                        "select 1 from json, files " +
                        "where json.directory = '" + directory + "' " +
                        "and json.file_name = 'content.json' " +
                        "and files.json_id = json.json_id " +
                        "and files.filename = 'status.json'" ;
                    console.log(pgm + 'w2_query_8 = ' + w2_query_8) ;
                    debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2_query_8', 'dbQuery') ;
                    ZeroFrame.cmd("dbQuery", [w2_query_8], function (res) {
                        var pgm = service + '.delete_status_json dbQuery callback 2: ';
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + res.length + ' rows');
                        // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        if (!res || res.error) {
                            console.log(pgm + 'status.json query failed. res = ' + JSON.stringify(res));
                            console.log(pgm + 'w2_query_8 = ' + w2_query_8);
                            return cb() ;
                        }
                        if (!res.length) return cb() ; // already deleted
                        get_user_path(function (my_user_path) {
                            var pgm = service + '.delete_status_json get_user_path callback 3: ';
                            var inner_path ;
                            inner_path = my_user_path + 'status.json' ;
                            MoneyNetworkAPILib.z_file_delete(pgm, inner_path, function (res) {
                                var pgm = service + '.delete_status_json z_file_delete callback 4: ';
                                if (res == 'ok') {
                                    // status.json was deleted. sign change
                                    z_publish({reason: inner_path}, function() {
                                        cb()
                                    }) ;
                                }
                                else {
                                    console.log(pgm + 'delete status.json failed. res = ' + JSON.stringify(res)) ;
                                    cb() ;
                                }
                            }) ; // z_file_delete callback 4

                        }) ; // get_user_path callback 3

                    }) ; // dbQuery callback 2

                }) ; // get_my_wallet_hub callback 1

            } // delete_status_json

            // sign or publish
            var z_publish_interval = 0 ;
            var z_publish_pending = false ;

            function z_publish(options, cb) {
                var pgm = service + '.z_publish: ';
                var pgm2, publish, group_debug_seq, reason, inner_path;
                if (!options) options = {};
                publish = options.publish;
                group_debug_seq = options.group_debug_seq;
                if (options.reason) reason = options.reason ;
                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq);
                if (!cb) cb = function () {};
                // get full merger site user path
                get_user_path(function (user_path) {
                    var cmd;
                    inner_path = user_path + 'content.json';
                    if (publish) console.log(pgm + 'publishing ' + inner_path);
                    // content.json file must have optional files support
                    encrypt1.add_optional_files_support({group_debug_seq: group_debug_seq}, function () {
                        var debug_seq;

                        // sign or publish
                        cmd = publish ? 'sitePublish' : 'siteSign';
                        if (publish) {
                            // use MN publish queue. max one publish once every 30 seconds
                            MoneyNetworkAPILib.z_site_publish({inner_path: inner_path, encrypt: encrypt2, reason: reason}, function (res) {
                                var pgm = service + '.z_site_publish callback 4: ';
                                var pgm2;
                                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq);
                                console.log(pgm2 + 'res = ' + JSON.stringify(res));
                                if (res != "ok") {
                                    z_wrapper_notification(["error", "Failed to " + (publish ? "publish" : "sign") + ": " + res.error, 5000]);
                                    // error - repeat sitePublish in 30, 60, 120, 240 etc seconds (device maybe offline or no peers)
                                    if (!z_publish_interval) z_publish_interval = 30;
                                    else z_publish_interval = z_publish_interval * 2;
                                    console.log(pgm2 + 'Error. Failed to publish: ' + res.error + '. Try again in ' + z_publish_interval + ' seconds');
                                    var retry_zeronet_site_publish = function () {
                                        z_publish({publish: publish, reason: reason, group_debug_seq: group_debug_seq}, cb);
                                    };
                                    $timeout(retry_zeronet_site_publish, z_publish_interval * 1000);
                                    // continue processing while waiting for failed sitePublish to finish
                                    return cb(res.error);
                                }
                                // sign/publish OK
                                z_publish_interval = 0;
                                cb();
                            });
                            return;
                        }
                        // sign only. fast operation
                        debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, cmd, null, group_debug_seq);
                        ZeroFrame.cmd(cmd, {inner_path: inner_path}, function (res) {
                            var pgm = service + '.z_publish ' + cmd + ' callback 4: ';
                            var pgm2;
                            pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq);
                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                            console.log(pgm2 + 'res = ' + res);
                            if (res != "ok") {
                                z_wrapper_notification(["error", "Failed to " + (publish ? "publish" : "sign") + ": " + res.error, 5000]);
                                return cb(res.error); // sign only. must be a serious error
                            }
                            // sign OK
                            z_publish_pending = true;
                            cb();

                        }); // sitePublish callback 4

                    }); // add_optional_files_support callback 2

                }); // get_user_path callback 1

            } // z_publish


            // inject wallet z_publish function into MoneyNetworkAPILib. used for waiting_for_file notifications (hanging fileGet operations)
            function waiting_for_file_publish (request_filename) {
                z_publish({publish: true, reason: (request_filename ? request_filename : 'waiting_for_file')}) ;
            }
            MoneyNetworkAPILib.config({waiting_for_file_publish: waiting_for_file_publish}) ;

            var get_content_json_cbs = [] ; // callbacks waiting for first get_content_json request to finish
            function get_content_json (cb) {
                var pgm = service + '.get_content_json: ' ;
                if (z_cache.content_json == true) return get_content_json_cbs.push(cb) ; // wait for first get_content_json request to finish
                if (z_cache.content_json) return cb(z_cache.content_json) ; // wallet.json is already in cache
                z_cache.content_json = true ;
                get_user_path(function (user_path) {
                    var inner_path ;
                    inner_path = user_path + 'content.json' ;
                    z_file_get(pgm, {inner_path: inner_path, required: false}, function (content_str) {
                        var content ;
                        if (!content_str) content = {} ;
                        else {
                            try {content = JSON.parse(content_str) }
                            catch (e) {
                                console.log(pgm + inner_path + ' was invalid. content_str = ' + content_str + ', error = ' + e.message) ;
                                content = {} ;
                            }
                        }
                        z_cache.content_json = content ;
                        cb(z_cache.content_json) ;
                        while (get_content_json_cbs.length) { cb = get_content_json_cbs.shift() ; cb(z_cache.content_json)} ;
                    }) ; // z_file_get callback 2
                }) ; // get_user_path callback 1
            } // get_content_json

            function write_content_json(cb) {
                var pgm = service + '.write_content_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.content_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_content_json get_user_path callback 1: ';
                    var inner_path, debug_seq ;
                    inner_path = user_path + 'content.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    debug_seq = MoneyNetworkAPILib(pgm, inner_path, 'fileWrite') ;
                    z_file_write(pgm, inner_path, btoa(json_raw), function (res) {
                        var pgm = service + '.write_content_json fileWrite callback 2: ';
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
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
                    z_file_get(pgm, {inner_path: inner_path, required: false}, function (wallet_str) {
                        var wallet ;
                        if (!wallet_str) wallet = {} ;
                        else {
                            try {
                                wallet = JSON.parse(wallet_str) ;
                            }
                            catch (e) {
                                console.log(pgm + 'ignoring invalid wallet.json file ' + inner_path + '. wallet_str = ' + wallet_str + ', error = ' + e.message) ;
                                wallet = {} ;
                            }
                        }
                        z_cache.wallet_json = wallet ;
                        cb(z_cache.wallet_json) ;
                        while (get_wallet_json_cbs.length) { cb = get_wallet_json_cbs.shift() ; cb(z_cache.wallet_json)}
                    }) ; // z_file_get callback 2
                }) ; // get_user_path callback 1
            } // get_wallet_json

            function write_wallet_json(cb) {
                var pgm = service + '.write_wallet_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.wallet_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_wallet_json get_user_path callback 1: ';
                    var inner_path, debug_seq ;
                    inner_path = user_path + 'wallet.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'fileWrite') ;
                    z_file_write(pgm, inner_path, btoa(json_raw), function (res) {
                        var pgm = service + '.write_wallet_json fileWrite callback 2: ';
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        cb(res);
                    }); // fileWrite callback 2
                }) ; // get_user_path callback 2
            } // write_wallet_json

            // write public wallet info
            function update_wallet_json(cb) {
                var pgm = service + '.update_wallet_json: ';
                if (!cb) cb = function () {};

                get_my_wallet_hub(function (hub, other_wallet_data_hub, other_wallet_data_hub_title) {
                    get_wallet_json(function (wallet) {
                        var pgm = service + '.update_wallet_json get_wallet_json callback 2: ';
                        var old_wallet_str, old_wallet_json, error, key, wallet_sha256, w2_query_3, debug_seq2 ;
                        console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                        old_wallet_str = JSON.stringify(wallet) ;
                        old_wallet_json = JSON.parse(old_wallet_str) ;
                        if (wallet) {
                            // validate after read
                            error = MoneyNetworkAPILib.validate_json(pgm, wallet) ;
                            if (error) {
                                // old wallet info is invalid. delete all
                                console.log(pgm + 'deleting invalid wallet.json. error = ' + error) ;
                                for (key in wallet) delete wallet[key]
                            }
                        }
                        wallet.msgtype = 'wallet' ;
                        wallet.wallet_address = ZeroFrame.site_info.address;
                        wallet.wallet_domain = ZeroFrame.site_info.domain;
                        if (!wallet.wallet_domain) delete wallet.wallet_domain ;
                        wallet.wallet_title = ZeroFrame.site_info.content.title;
                        wallet.wallet_description = ZeroFrame.site_info.content.description;
                        wallet.currencies = [{
                            code: 'tBTC',
                            name: 'Test Bitcoin',
                            url: 'https://en.bitcoin.it/wiki/Testnet',
                            fee_info: 'Fee is calculated by external API (btc.com) and subtracted from amount. Calculated from the last X block in block chain. Lowest fee that still had more than an 80% chance to be confirmed in the next block.',
                            units: [
                                { unit: 'BitCoin', factor: 1, decimals: 8 },
                                { unit: 'Satoshi', factor: 0.00000001, decimals: 0 }
                            ]
                        }];
                        wallet.api_url = 'https://www.blocktrail.com/api/docs' ;
                        // random wallet data hub. for list of wallet hubs
                        if (!wallet.hub) {
                            wallet.hub = other_wallet_data_hub ;
                            wallet.hub_title = other_wallet_data_hub_title ;
                        }
                        // extra info for cross wallet site integration. identical currencies, schemas and workflow. maybe compatible
                        wallet.json_schemas = extra_json_schemas ;
                        wallet.message_workflow = message_workflow ;

                        // calc wallet_sha256 signature. sha256 signature can be used instead of wallet_address, wallet_title, wallet_description and wallet_currencies
                        wallet_sha256 = MoneyNetworkAPILib.calc_wallet_sha256 (wallet) ;
                        if (!wallet_sha256) {
                            console.log(pgm + 'cannot calculate wallet_sha256. See error in log. wallet = ' + JSON.stringify(wallet)) ;
                            return cb('cannot calculate wallet_sha256. See error in log. wallet = ' + JSON.stringify(wallet));
                        }
                        console.log(pgm + 'wallet_sha256 = ' + wallet_sha256) ;
                        if ((wallet.msgtype == old_wallet_json.msgtype) &&
                            (wallet_sha256 == old_wallet_json.wallet_sha256) &&
                            (wallet.hub == old_wallet_json.hub)) {
                            console.log(pgm + 'ok. no change to public wallet information') ;
                            return cb("ok") ;
                        }
                        else {
                            console.log(pgm + 'updating wallet.json') ;
                            if (wallet.msgtype != old_wallet_json.msgtype) console.log(pgm + 'changed msgtype. old = ' + old_wallet_json.msgtype + ', new = ' + wallet.msgtype) ;
                            if (wallet_sha256 != old_wallet_json.wallet_sha256) console.log(pgm + 'changed wallet_sha256. old = ' + old_wallet_json.wallet_sha256 + ', new = ' + wallet_sha256) ;
                            if (wallet.hub != old_wallet_json.hub) console.log(pgm + 'changed hub. old = ' + old_wallet_json.hub + ', new = ' + wallet.hub) ;
                        }

                        // count number of wallets with this wallet_sha256 signature
                        // there should always be 5 wallets with identical full wallet information (wallet_address, wallet_title, wallet_description, currencies and wallet_sha256)
                        wallet.wallet_sha256 = wallet_sha256 ;
                        w2_query_3 =
                            "select count(*) as no from (" +
                            "  select keyvalue.json_id, count(*) as no " +
                            "  from keyvalue as wallet_sha256, json, keyvalue " +
                            "  where wallet_sha256.key = 'wallet_sha256' " +
                            "  and wallet_sha256.value = '" + wallet_sha256 + "' " +
                            "  and json.json_id = wallet_sha256.json_id " +
                            "  and json.directory like '" + hub + "/%' " +
                            "  and keyvalue.json_id = wallet_sha256.json_id " +
                            "  and keyvalue.value is not null " +
                            "  and keyvalue.key like 'wallet_%' " +
                            "  group by keyvalue.json_id " +
                            "  having count(*) >= 4" +
                            ")" ;
                        console.log(pgm + 'w2 query 3 = ' + w2_query_3) ;
                        debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 3', 'dbQuery') ;
                        ZeroFrame.cmd("dbQuery", [w2_query_3], function (res) {
                            var pgm = service + '.update_wallet_json dbQuery callback 3: ';
                            var write_full_info ;
                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + res.length + ' rows');
                            // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                            if (res.error || (res.length != 1)) {
                                console.log(pgm + 'wallet sha256 query failed. res = ' + JSON.stringify(res));
                                console.log(pgm + 'w2 query 3 = ' + w2_query_3);
                                write_full_info = true;
                            }
                            else write_full_info = (res[0].no < 5) ;
                            console.log(pgm + 'write_full_info = ' + write_full_info) ;
                            if (!write_full_info) {
                                // full wallet info is already in database. only wallet_sha256 signature is needed in wallet.json
                                delete wallet.wallet_address ;
                                delete wallet.wallet_domain ;
                                delete wallet.wallet_title ;
                                delete wallet.wallet_description ;
                                delete wallet.currencies ;
                            }
                            if (old_wallet_str == JSON.stringify(wallet)) return cb('ok'); // no change to public wallet information
                            console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                            // validate before write. also done in calc_wallet_sha256
                            error = MoneyNetworkAPILib.validate_json(pgm, wallet) ;
                            if (error) return cb('cannot write invalid wallet.json. error = ' + error + ', wallet = ' + JSON.stringify(wallet));
                            write_wallet_json(function (res) {
                                var pgm = service + '.update_wallet_json write_wallet_json callback 4: ';
                                console.log(pgm + 'res = ' + JSON.stringify(res));
                                if (res == "ok") {
                                    console.log(pgm + 'sign now and publish after end of session handshake. see initialize');
                                    z_publish({publish: false, reason: 'wallet.json'}, cb);
                                }
                                else cb(res);
                            }); // write_wallet_json callback 4
                        }) ; // dbQuery callback 3
                    }); // get_wallet_json callback 2
                }) ; // get_my_wallet_hub callback 1
            } // update_wallet_json

            function save_w_session(session_info, options, cb) {
                var pgm = service + '.save_w_session: ' ;
                var pgm2, group_debug_seq, auth_address, sha256 ;
                sessionid = session_info.money_transactionid ;
                if (!options) options = {} ;
                if (!cb) cb = function() {} ;
                group_debug_seq = options.group_debug_seq ;
                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                console.log(pgm2 + 'save new wallet to wallet session encrypted in ls. session_info = ' + JSON.stringify(session_info));
                if (!ls.w_sessions) ls.w_sessions = {};
                auth_address = ZeroFrame.site_info.auth_address;
                if (!ls.w_sessions[auth_address]) ls.w_sessions[auth_address] = {};
                // cache unencrypted session info in z_cache
                if (!z_cache.w_sessions) z_cache.w_sessions = {} ;
                if (!z_cache.w_sessions[auth_address]) z_cache.w_sessions[auth_address] = {};
                sha256 = CryptoJS.SHA256(sessionid).toString();
                if (z_cache.w_sessions[auth_address][sha256]) {
                    console.log(pgm + 'session_info is already in z_cache') ;
                    if (JSON.stringify(session_info) != JSON.stringify(z_cache.w_sessions[auth_address][sha256])) {
                        console.log(pgm + 'error. difference between session_info in save_w_session call and session_info in z_cache') ;
                        console.log(pgm + 'session_info = ' + JSON.stringify(session_info)) ;
                        console.log(pgm + 'z_cache session_info = ' + JSON.stringify(z_cache.w_sessions[auth_address][sha256])) ;
                        z_cache.w_sessions[auth_address][sha256] = session_info ;
                    }
                }
                else z_cache.w_sessions[auth_address][sha256] = session_info ;
                // encrypt and save encrypted in ls
                get_my_pubkey2(function (pubkey2) {
                    encrypt1.encrypt_json(session_info, {encryptions: [2], group_debug_seq: group_debug_seq}, function (encrypted_session_info) {
                        ls.w_sessions[auth_address][sha256] = encrypted_session_info;
                        ls_save();
                        console.log(pgm + 'OK. Saved wallet-wallet session information in localStorage');
                        cb();
                    }); // encrypt_json
                }); // get_my_pubkey2
            } // save_w_session

            // read from z_cache (unencrypted) or load from ls (encrypted)
            // options:
            // - group_debug_seq: for console.log debug messages
            // - ip_external: boolean: refresh session_info.ip_external after session read?
            function read_w_session (sessionid, options, cb) {
                var pgm = service + '.read_w_session: ' ;
                var pgm2, group_debug_seq, ip_external, delete_msg, auth_address, sha256, encrypted_session_info, cb2 ;
                // get options
                if (!options) options = {} ;
                group_debug_seq = options.group_debug_seq ;
                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                ip_external = options.ip_external ;
                if (typeof delete_msg == 'string') delete_msg = [delete_msg] ;

                // extend cb: optional refresh ip_external info
                cb2 = function (session_info) {
                    var debug_seq ;
                    if (!session_info) return cb(session_info) ;
                    if (!ip_external) return cb(session_info) ;
                    debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'serverInfo', null, group_debug_seq);
                    ZeroFrame.cmd("serverInfo", {}, function (server_info) {
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, server_info ? 'OK' : 'Error');
                        session_info.ip_external = server_info.ip_external;
                        cb(session_info);
                    });
                } ; // cb2

                // check z_cache (already decrypted)
                if (!z_cache.w_sessions) z_cache.w_sessions = {};
                auth_address = ZeroFrame.site_info.auth_address;
                if (!z_cache.w_sessions[auth_address]) z_cache.w_sessions[auth_address] = {};
                sha256 = CryptoJS.SHA256(sessionid).toString();
                if (z_cache.w_sessions[auth_address][sha256]) {
                    // unencrypted session info is already in z_cache
                    return cb2(z_cache.w_sessions[auth_address][sha256]) ;
                }
                // load from ls (encrypted)
                if (!ls.w_sessions) ls.w_sessions = {};
                if (!ls.w_sessions[auth_address]) ls.w_sessions[auth_address] = {};
                encrypted_session_info = ls.w_sessions[auth_address][sha256];
                if (!encrypted_session_info) return cb2(); // not found in ls

                // decrypt session information
                get_my_pubkey2(function (pubkey2) {
                    var pgm = service + '.read_w_session get_my_pubkey2 callback 1: ' ;
                    encrypt1.decrypt_json(encrypted_session_info, {group_debug_seq: group_debug_seq}, function (session_info) {
                        var pgm = service + '.read_w_session decrypt_json callback 2: ' ;
                        var pgm2 ;
                        pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                        console.log(pgm2 + 'session_info = ' + JSON.stringify(session_info));
                        z_cache.w_sessions[auth_address][sha256] = session_info ;
                        cb2(session_info) ;
                    });
                }) ;

            } // read_w_session


            // after load old wallet sessions. cleanup offline and normal files that is not in session_info.files objects ( = ls.w_files )
            // for example waiting_for_file requests and status_mt messages
            function cleanup_offline_session_files () {
                var pgm = service + '.cleanup_offline_session_files: ';
                var session_files, filename, directory, w2_query_7, debug_seq, auth_address, sha256, session_info, ls_updated ;
                if (!ls.w_files) ls.w_files = {} ;
                // migration. any files in session_info.files that is not in w_files
                // session_info is encrypted with user cert. ls.w_files is not encrypted and for all certs
                if (!z_cache.w_sessions) z_cache.w_sessions = {} ;
                auth_address = ZeroFrame.site_info.auth_address ;
                if (!z_cache.w_sessions[auth_address]) z_cache.w_sessions[auth_address] = {} ;
                for (sha256 in z_cache.w_sessions[auth_address]) {
                    session_info = z_cache.w_sessions[auth_address][sha256] ;
                    if (!session_info.files) continue ;
                    for (filename in session_info.files) {
                        if (!ls.w_files[filename]) {
                            ls.w_files[filename] = true ;
                            ls_updated = true ;
                        }
                    }
                }
                // initialize session_files
                session_files = [] ;
                for (filename in ls.w_files) session_files.push(filename) ;
                console.log(pgm + 'session_files = ' + JSON.stringify(session_files)) ;
                //session_files = [
                //    "a932f57dcd-o.1512390150104","a932f57dcd-o.1512390209794","74aff4c388-o.1512410824922",
                //    "e17de9be9e-o.1512464275445","572bba988f-o.1512466704466"] ;

                // get all files for current user directory (optional and normal)
                directory = z_cache.my_wallet_data_hub + "/data/users/" + ZeroFrame.site_info.auth_address ;
                w2_query_7 =
                    "select files_optional.filename from json, files_optional " +
                    "where json.directory like '" + directory + "' " +
                    "and json.file_name = 'content.json' " +
                    "and files_optional.json_id = json.json_id " +
                    "  union all " +
                    "select files.filename from json, files " +
                    "where json.directory like '" + directory + "' " +
                    "and json.file_name = 'content.json' " +
                    "and files.json_id = json.json_id" ;
                console.log(pgm + 'w2_query_7 = ' + w2_query_7);
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2_query_7', 'dbQuery') ;
                ZeroFrame.cmd("dbQuery", [w2_query_7], function (db_files) {
                    var pgm = service + '.cleanup_offline_session_files dbQuery callback 1: ';
                    var i, re, m, delete_files ;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!db_files || db_files.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + db_files.length + ' rows');
                    if (db_files.error) {
                        console.log(pgm + 'query failed. error = ' + db_files.error);
                        console.log(pgm + 'w2_query_7 = ' + w2_query_7);
                        return;
                    }
                    // keeping only normal and -o offline files in cleanup loop
                    re = new RegExp('^[0-9a-f]{10}(-o|-io)?\.[0-9]{13}$');
                    for (i = db_files.length - 1; i >= 0; i--) {
                        m = db_files[i].filename.match(re);
                        if (!m) db_files.splice(i, 1);
                        else db_files[i] = db_files[i].filename ;
                    }
                    console.log(pgm + 'db_files = ' + JSON.stringify(db_files));

                    delete_files = [] ;
                    for (i=0 ; i<db_files.length ; i++) {
                        filename = db_files[i] ;
                        if (session_files.indexOf(filename) == -1) delete_files.push(filename) ;
                    }
                    console.log(pgm + 'delete_files = ' + JSON.stringify(delete_files)) ;
                    if (!delete_files.length) {
                        if (z_publish_pending) {
                            console.log(pgm + 'pending publish. wallet.json updated? temporary session files deleted? publish to distribute changes to other users');
                            z_publish({publish: true, reason: 'cleanup_offline_session_files. pending publish'}, function (res) {
                                if (ls_updated) ls_save() ;
                            });
                        }
                        return ;
                    }

                    MoneyNetworkAPILib.start_transaction(pgm, function (transaction_timestamp) {
                        var pgm = service + '.cleanup_offline_session_files start_transaction callback 2: ';
                        var merged_directory, no_deleted, no_not_deleted, delete_file ;
                        // delete delete_file callback loop
                        merged_directory = 'merged-' + MoneyNetworkAPILib.get_merged_type() + '/' + directory + '/' ;
                        no_deleted = 0 ;
                        no_not_deleted = 0 ;
                        delete_file = function() {
                            var pgm = service + '.cleanup_offline_session_files.delete_file: ';
                            var filename, inner_path ;
                            filename = delete_files.shift() ;
                            if (!filename) {
                                MoneyNetworkAPILib.end_transaction(transaction_timestamp) ;
                                if (no_deleted) console.log(pgm + no_deleted + ' files were deleted.') ;
                                if (no_not_deleted) console.log(pgm + no_not_deleted + ' files were not deleted. See error message above') ;
                                if (no_deleted) {
                                    z_publish({publish: true, reason: 'load_w_sessions/cleanup_offline_session_files. ' + no_deleted + ' file(s) deleted'}, function(res) {
                                        if (ls_updated) ls_save() ;
                                    }) ;
                                }
                                else if (z_publish_pending) {
                                    console.log(pgm + 'pending publish. wallet.json updated? temporary session files deleted? publish to distribute changes to other users');
                                    z_publish({publish: true, reason: 'cleanup_offline_session_files. pending publish'}, function (res) {
                                        if (ls_updated) ls_save() ;
                                    });
                                }
                                return ;
                            }
                            inner_path = merged_directory + filename ;
                            MoneyNetworkAPILib.z_file_delete(pgm, inner_path, function (res) {
                                if (res =='ok') no_deleted++ ;
                                else {
                                    console.log(pgm + 'error. ' + filename + ' was not deleted. res = ' + JSON.stringify(res)) ;
                                    no_not_deleted++ ;
                                }
                                // delete next file
                                delete_file() ;
                            }) ;
                        } ; // delete_file
                        // start delete_file loop
                        delete_file() ;
                    }) ; // start_transaction callback 2

                }); // dbQuery callback

            } // cleanup_offline_session_files


            // start up. load wallet session from ls and initialize MoneyNetworkAPI objects. One for each wallet session
            function load_w_sessions() {
                var pgm = service + '.load_w_sessions: ';
                var auth_address, sha256_values, group_debug_seq, no_loaded, no_not_loaded ;
                if (!ls.w_sessions) {
                    // no wallet sessions were found in ls
                    console.log(pgm + 'stop. no wallet session were found in ls') ;
                    return;
                }
                if (!ZeroFrame.site_info.cert_user_id) {
                    // not logged in
                    console.log(pgm + 'stop. not logged in') ;
                    return ;
                }
                auth_address = ZeroFrame.site_info.auth_address;
                if (!ls.w_sessions[auth_address]) return; // no wallet sessions was found for this auth_address
                sha256_values = Object.keys(ls.w_sessions[auth_address]);
                if (!z_cache.w_sessions) z_cache.w_sessions = {} ;
                if (!z_cache.w_sessions[auth_address]) z_cache.w_sessions[auth_address] = {} ;
                group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;
                console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this load_w_sessions operation');
                no_loaded = 0 ;
                no_not_loaded = 0 ;

                // initialize self encryption object encrypt1
                get_my_pubkey2(function (pubkey2) {
                    var pgm = service + '.load_w_sessions get_my_pubkey2 callback: ';
                    var load_session ;

                    // create load session loop. decrypt and initialize wallet sessions one by one
                    load_session = function () {
                        var pgm = service + '.load_w_sessions.load_session: ';
                        var pgm2, sha256, encrypted_session_info;
                        pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq);
                        sha256 = sha256_values.shift();
                        if (!sha256) {
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                            console.log(pgm2 + 'done loading old wallet sessions. ' + no_loaded + ' wallet sessions were loaded. ' + no_not_loaded + ' wallet sessions were not loaded') ;
                            cleanup_offline_session_files() ;
                            return;
                        }
                        encrypted_session_info = ls.w_sessions[auth_address][sha256];
                        console.log(pgm2 + 'encrypted_session_info = ' + JSON.stringify(encrypted_session_info)) ;
                        // decrypt session information
                        encrypt1.decrypt_json(encrypted_session_info, {group_debug_seq: group_debug_seq}, function (session_info) {
                            var pgm = service + '.read_w_session decrypt_json callback 2: ';
                            var pgm2;
                            pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq);
                            console.log(pgm2 + 'session_info = ' + JSON.stringify(session_info));
                            if (!session_info) {
                                console.log(pgm2 + 'decrypt_json failed for encrypted_session_info = ' + JSON.stringify(encrypted_session_info)) ;
                                // load next wallet session
                                no_not_loaded++ ;
                                return load_session() ;
                            }
                            if (session_info.money_transactionid == 'WEWMZyr6JaTc1JpOu5pI7A4Btjk7oXiqGlaDXtjMN2J2rDofMijpazqP2eEg') delete session_info.error ;
                            if (session_info.error) {
                                console.log(pgm2 + 'ignoring old failed wallet session. error = ' + session_info.error + ', session_info = ' + JSON.stringify(session_info)) ;
                                // load next wallet session
                                no_not_loaded++ ;
                                return load_session() ;
                            }
                            // https://github.com/jaros1/Money-Network/issues/273
                            // renamed master to sender (and client to receiver)
                            if (session_info.hasOwnProperty('master')) {
                                session_info.sender = session_info.master ;
                                delete session_info.master ;
                            }
                            if (typeof session_info.sender != 'boolean') console.log(pgm + 'error. sender is invalid. session_info = ' + JSON.stringify(session_info));
                            z_cache.w_sessions[auth_address][sha256] = session_info;
                            // initialize MoneyNetworkAPI instance for this wallet session
                            new MoneyNetworkAPI({
                                debug: session_info.sender ? 'encrypt3' : 'encrypt4',
                                sessionid: session_info.money_transactionid,
                                sender: session_info.sender,
                                prvkey: session_info.prvkey,
                                userid2: session_info.userid2,
                                pubkey: session_info.pubkey,
                                pubkey2: session_info.pubkey2
                            });
                            no_loaded++ ;
                            // load next wallet session
                            load_session() ;
                        });

                    }; // load_session ;
                    // start load sessions loop
                    load_session();

                }); // get_my_pubkey2 callback

            } // load_w_sessions
            // run when ZeroNet and Ls is ready
            // ls_bind(load_w_sessions) ;


            // show error in log, notification in w2 and error notification in mn
            // - pgm: calling pgm
            // - error: string or array of strings
            // - options. object with log, w2 and mn booleans. default is true
            function report_error (pgm, error, options, cb) {
                var request, notification ;
                // validate parameters.
                if ((typeof pgm != 'string') ||
                    ((typeof error != 'string') && !Array.isArray(error)) ||
                    (options && (typeof options != 'object')) &&
                    (cb && typeof cb != 'function')) {
                    console.log(service + '.report_error: invalid call. p1 pgm = ', pgm + ', p2 error = ', error, ', p3 options = ', options, ', p4 cb = ', cb) ;
                    return ;
                }
                if (typeof error == 'string') error = [error] ;
                if (!options) options = {} ;
                else options = JSON.parse(JSON.stringify(options)) ;
                if (!options.hasOwnProperty('log')) options.log = true ;
                if (!options.hasOwnProperty('w2')) options.w2 = true ;
                if (!options.hasOwnProperty('mn')) options.mn = true ;
                if (!options.hasOwnProperty('type')) options.type = 'error' ;
                if (['info', 'error', 'done'].indexOf(options.type) == -1) {
                    console.log(pgm + 'warning. invalid options.type ', options.type + '. using error type') ;
                    options.type = 'error' ;
                }
                if (options.group_debug_seq && !options.hasOwnProperty('end_group_operation')) options.end_group_operation = true ;
                if (options.log) console.log(pgm + error.join('. ')) ;
                if (options.w2) {
                    notification = [options.type, error.join('<br>')] ;
                    if (options.timeout) notification.push(options.timeout) ;
                    z_wrapper_notification(notification);
                }
                if (!options.mn) {
                    if (options.end_group_operation) MoneyNetworkAPILib.debug_group_operation_end(options.group_debug_seq, pgm + error.join('. ')) ;
                    return ;
                }
                if (!cb) cb = function() {} ;
                if (!encrypt2.sessionid) {
                    console.log(pgm + 'No MN-W2 session. Skipping MN notification') ;
                    if (options.end_group_operation) MoneyNetworkAPILib.debug_group_operation_end(options.group_debug_seq, pgm + error.join('. ')) ;
                    return ;
                }
                // send error notification to mn session using global encrypt2 object (mn-w2 session)
                request = {
                    msgtype: 'notification',
                    type: options.type,
                    message: error.join('<br>')
                };
                if (options.timeout) request.timeout = options.timeout ;
                console.log(pgm + 'request = ' + JSON.stringify(request));
                encrypt2.send_message(request, {response: false, group_debug_seq: options.group_debug_seq, end_group_operation: options.end_group_operation}, function (response) {
                    console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                    // if (options.end_group_operation) MoneyNetworkAPILib.debug_group_operation_end(options.group_debug_seq, pgm + error.join('. ')) ;
                    cb() ;
                }); // send_message callback
            } // report error

            // before sending money transaction files. check if zeronet port is open. required for optional files distribution (money transactions)
            // server_info about port maybe old and not always true when enabling/disabling vpn on a client
            // serverPortcheck request can be used to refresh port info but requires ADMIN permission
            function check_port (pgm, session_info, group_debug_seq, send_exception, cb) {
                var debug_seq;
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'serverInfo', null, group_debug_seq);
                ZeroFrame.cmd("serverInfo", {}, function (server_info) {
                    try {
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, server_info ? 'OK' : 'Error');
                        session_info.ip_external = server_info.ip_external;
                        if (!session_info.ip_external) console.log(pgm + 'ZeroNet port should be closed. Re-check port! Using normal files instead of optional files for money transactions. Distributed to all users');
                        else console.log(pgm + 'ZeroNet port should be open. Re-check port! Using optional files for money transactions. Distributed by request.');
                        cb();
                    }
                    catch (e) { return send_exception(pgm, e) }
                });
            } // check_port

            // send money error: Origin is not allowed by Access-Control-Allow-Origin
            // check money error: {"crossDomain":true}
            // open wallet error: Origin is not allowed by Access-Control-Allow-Origin
            // halt message processing and alert user in a confirm dialog
            function btc_cross_domain_error (error, restart_receive_message, session_info, group_debug_seq) {
                save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                    var pgm = service + '.btc_cross_domain_error save_w_session callback 1/' + group_debug_seq + ': ';
                    var message, confirm_status, request2 ;
                    console.log(pgm + 'saved session_info in ls');
                    message = ['Communication with btc.com failed', error, 'Origin is not allowed by Access-Control-Allow-Origin', 'Please disable VPN and press OK'] ;

                    // confirm dialog in W2 and in MN
                    // open two confirm dialog boxes.
                    // one here in W2 session. The other in MN session
                    confirm_status = {done: false};
                    // path 1) confirm box in w2
                    ZeroFrame.cmd("wrapperConfirm", [message.join('<br>'), 'OK'], function (confirm) {
                        if (confirm_status.done) return; // confirm dialog done (OK or timeout)
                        confirm_status.done = true ;
                        if (!confirm) return ; // do nothing.
                        // confirmed. restart processing
                        restart_receive_message();
                    }) ;
                    // path 2) confirm box in MN
                    request2 = {
                        msgtype: 'confirm',
                        message: message.join('<br>'),
                        button_caption: 'OK'
                    };
                    console.log(pgm + 'sending request2 = ' + JSON.stringify(request2));
                    // timeout 600 seconds = 10 minutes
                    encrypt2.send_message(request2, {response: 600000, group_debug_seq: group_debug_seq}, function (response) {
                        try {
                            var pgm = service + '.btc_cross_domain_error send_message callback 2/' + group_debug_seq + ': ';
                            if (confirm_status.done) return; // confirm dialog done (OK or timeout)
                            confirm_status.done = true ;
                            // response should be OK or timeout
                            if (response && !response.error) {
                                // confirmed. continue
                                return restart_receive_message() ;
                            }
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. timeout after 600 seconds. No or late user feedback in MN session
                                return;
                            }
                            // unexpected response from confirm request
                            console.log(pgm + 'error: response = ' + JSON.stringify(response)) ;
                        }
                        catch (e) {
                            console.log(pgm + e.message);
                            console.log(e.stack);
                            report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                        }
                    }); // send_message callback 2

                }) ; // save_w_session callback 1
            }  // btc_cross_domain_error


            // workaround used in receive w2_check_mt and w2_start_mt messages
            // receiving incoming messages in wrong order. pubkeys message is required
            // pubkeys message should be in optional_files table for same session with a lower timestamp
            // pubkeys message should be in ZeroNet optionalFileList with a status
            // demon should be asked to reprocess lost incoming pubkeys file
            // demon should be asked to reprocess this incoming <<in_msg_name>> message after pubkeys message
            // max no tries? there could be a JS error in receiving pubkeys message and process should not loop forever
            // 1: find filename for previous incoming file (or first) for this wallet session. should be pubkeys message
            // 2: add a pubkeys retry count to session_info and save. max <n> pubkeys retries
            // 3: ask message_demon to reprocess missing pubkeys file
            // 4: ask message_demon to reprocess this messsage again in a few seconds
            function wait_for_pubkeys_message (options) {
                var pgm = service + '.wait_for_pubkeys_message: ';
                var encrypt2, session_info, in_filename, in_msg_name, out_msg_name, group_debug_seq, w2_query_6, debug_seq1, file_timestamp ;

                // get parameters
                encrypt2 = options.encrypt2 ;
                session_info = options.session_info ;
                in_filename = options.in_filename ;
                in_msg_name = options.in_msg_name ;
                out_msg_name = options.out_msg_name ;
                group_debug_seq = options.group_debug_seq ;
                file_timestamp = parseInt(in_filename.substr(-13)) ;
                console.log(pgm + 'in_filename = ' + in_filename + ', file_timestamp = ' + file_timestamp) ;

                // 1: find filename for previous incoming file (=first) for this wallet session. should be pubkeys message
                w2_query_6 =
                    "select filename from files where filename like '" + encrypt2.other_session_filename + "%'" +
                    "  union all " +
                    "select filename from files_optional where filename like '" + encrypt2.other_session_filename + "%'" ;
                console.log(pgm + 'w2_query_6 = ' + w2_query_6) ;
                debug_seq1 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 6', 'dbQuery', null, group_debug_seq) ;
                ZeroFrame.cmd("dbQuery", [w2_query_6], function (res) {
                    var pgm = service + '.wait_for_pubkeys_message dbQuery callback 1/' + group_debug_seq + ': ';
                    var re, i, timestamp, pubkeys_file_timestamp, pubkeys_filename, inner_path2, debug_seq2, redo_pubkeys, redo_this_msg, error ;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq1, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + res.length + ' rows');
                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    if (!res || res.error) {
                        console.log(pgm + 'error. search for pubkeys message failed. dbQuery failed. error = ' + JSON.stringify(res) ) ;
                        console.log(pgm + 'w2_query_6 = ' + w2_query_6) ;
                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'dbQuery failed. ' + JSON.stringify(res)) ;
                        error = ['Money transaction failed', 'Missing pubkeys message', 'w2_query_6 failed', 'Cannot start encrypted communication'] ;
                        report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                        return ;
                    }
                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    // check filename. pubkeys message from other wallet session is a normal or an -o (external) optional file
                    re = /^[0-9a-f]{10}(-o)?\.[0-9]{13}$/;
                    console.log(pgm + 'old res.length = ' + res.length);
                    for (i = res.length - 1; i >= 0; i--) {
                        if (!res[i].filename.match(re)) continue; // invalid filename
                        else if (res[i].filename == in_filename) continue ; // this message
                        // check timestamp.
                        timestamp = parseInt(res[i].filename.slice(-13)) ;
                        if (timestamp > file_timestamp) continue ; // later messages after this message
                        if (!pubkeys_file_timestamp || (timestamp > pubkeys_file_timestamp)) {
                            // OK. should be pubkeys message
                            pubkeys_file_timestamp = timestamp ;
                            pubkeys_filename = res[i].filename ;
                        }
                    }
                    if (!pubkeys_file_timestamp) {
                        console.log(pgm + 'could not find any pubkeys message before this ' + in_msg_name + ' message') ;
                        error = ['Money transaction failed', 'Missing pubkeys message', 'Cannot start encrypted communication'] ;
                        session_info.error = error.join('. ') ; // mark transaction as failed. do not restart transaction
                        report_error(pgm, error, {group_debug_seq: group_debug_seq}, function() {
                            save_w_session(session_info, {group_debug_seq: group_debug_seq}) ;
                        }) ;
                        return ;
                    }
                    console.log(pgm + 'pubkeys_filename = ' + pubkeys_filename) ;

                    // 2: check optional file info for this lost pubkeys message
                    inner_path2 = encrypt2.other_user_path + pubkeys_filename ;
                    debug_seq2 = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path2, 'optionalFileInfo', null, group_debug_seq);
                    ZeroFrame.cmd("optionalFileInfo", [inner_path2], function (file_info) {
                        var pgm = service + '.wait_for_pubkeys_message optionalFileInfo callback 2/' + group_debug_seq + ': ';

                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq2, file_info ? 'OK' : 'Failed');
                        console.log(pgm + 'file_info = ' + JSON.stringify(file_info)) ;

                        // 3: add a counter for this fallback operation. Try 3 times
                        if (!session_info.lost_pubkey_message_count) session_info.lost_pubkey_message_count = 0 ;
                        session_info.lost_pubkey_message_count++ ;
                        save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                            var pgm = service + '.wait_for_pubkeys_message save_w_session callback 3/' + group_debug_seq + ': ';
                            var error ;
                            if (session_info.lost_pubkey_message_count > 3) {
                                console.log(pgm + 'stopping. tried 3 times to read lost pubkeys message. cannot send ' + out_msg_name + ' message without public keys') ;
                                error = ['Money transaction failed', 'Missing pubkeys message', 'Cannot start encrypted communication'] ;
                                report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                return ;
                            }
                            console.log(pgm + 'retrying receive pubkeys and ' + in_msg_name + ' messages. lost_pubkey_message_count = ' + session_info.lost_pubkey_message_count) ;

                            // 4: submit redo jobs
                            redo_pubkeys = function () {
                                var pgm = service + '.wait_for_pubkeys_message.redo_pubkeys/' + group_debug_seq + ': ';
                                var error ;
                                console.log(pgm + 'running redo_pubkeys for ' + pubkeys_filename) ;
                                encrypt2.redo_file(pubkeys_filename, function (error) {
                                    if (error) console.log(pgm, 'redo pubkeys message failed: error = ' + error) ;
                                });
                            } ;
                            redo_this_msg = function () {
                                var pgm = service + '.wait_for_pubkeys_message.redo_w2_check_mt/' + group_debug_seq + ': ';
                                var error ;
                                console.log(pgm + 'running redo_this_msg for ' + in_filename) ;
                                encrypt2.redo_file(in_filename, function (error) {
                                    if (error) console.log(pgm, 'redo ' + in_msg_name + ' failed: error = ' + error) ;
                                });
                            } ;
                            setTimeout(redo_pubkeys, 0) ;
                            setTimeout(redo_this_msg, 10000) ;
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'OK. Submitted redo_pubkeys and redo_this_msg jobs') ;

                        }) ; // save_w_session callback 3

                    }) ; // optionalFileInfo callback 2

                }) ; // dbQuery callback 1

            } // wait_for_pubkeys_message

            // cleanup old outgoing files, example:
            // - is "sender"
            // - is receiving w2_check_mt message from "receiver"
            // - "receiver" must have received 'pubkeys' message from "sender"
            // - find and delete pubkeys message from sender to receiver
            function delete_old_msg (options, cb) {
                var pgm = service + '.delete_old_msg: ';
                var session_info, msg_name, encrypt, group_debug_seq, msg_filename, key, inner_path, pgm2 ;
                // get params
                session_info = options.session_info ;
                msg_name = options.msg_name ;
                encrypt = options.encrypt ;
                group_debug_seq = options.group_debug_seq ;
                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                // find file
                if (!session_info.files) session_info.files = {} ;
                msg_filename = null ;
                for (key in session_info.files) if (session_info.files[key].msgtype == msg_name) msg_filename = key ;
                if (!msg_filename) {
                    console.log(pgm2 + 'warning. no cleanup. ' + msg_name + ' was not found in session_info.files') ;
                    return cb() ;
                }
                console.log(pgm2 + 'delete old outgoing ' + msg_name + ' from user directory and from session_info.files') ;
                // delete file
                inner_path = encrypt.this_user_path + msg_filename ;
                MoneyNetworkAPILib.z_file_delete(pgm, inner_path, function (res) {
                    var pgm = service + '.delete_old_msg z_file_delete callback: ';
                    var pgm2, auth_address ;
                    pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                    console.log(pgm2 + 'res = ' + JSON.stringify(res)) ;
                    delete session_info.files[msg_filename] ;
                    if (!ls.w_files) ls.w_files = {} ;
                    delete ls.w_files[msg_filename] ;
                    cb() ;
                }) ; // z_file_delete
            } // delete_old_msg

            // end of money ttransaction processing. cleanup. delete:
            // - public and private keys
            // -
            function cleanup_session_info (session_info) {
                //session_info = {
                //    "money_transactionid":"2tqVUMirPCP8NDZIKiciQKlch8YfUuhLRVhUnbzDH5TcUbEdyKEstZkOLoTH","sender":true,
                //    "contact":{"alias":"1CCiJ97XHgVeJ","cert_user_id":"1CCiJ97XHgVeJ@moneynetwork.bit","auth_address":"1CCiJ97XHgVeJrkbnzLgfXvYRr8QEWxnWF"},
                //    "money_transactions":[
                //        {"action":"Send","code":"tBTC","amount":0.00004411,"json":{"return_address":"2Mx89sU6Lkgvn5Bx6Ro6kkxdnXmYsi5Rznu","address":"2N67YLRRskJQQAdtFkZZR5wppyKtDuD3j9C"},"btc_send_at":1512476896044,"btc_send_ok":"6892ee5f982f9128255d2bd08f18ae262869426a55fdb62aa37414509f55a316"},
                //        {"action":"Request","code":"tBTC","amount":0.00004411,"json":{"address":"2MxDTo9dPQW6uCEZBM1eJJ2bSo3x4VXBuKL","return_address":"2Mvk6cHck84nNEx8oJL6obyxfLLKmU1Kq9b"},"btc_receive_ok":"866bf68413afdfa93786ba1662fefba6bfe0f7b887aaabce18392cebd4202229"}],
                //    "files":{},
                //    "ip_external":true,
                //    "prvkey":"-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBgHg8Nc30MtDKnz0XESWXxiS/A4IUtYV0oa8YG7cqfDfSfElpMknt\nc9gvNdep9G6yYuQxH+itxdyqIcqqv3hWGbkkStsErj66YTsMEjXTQLY4QKXOP6u5\nEk9BIhVhkEwrYuzkzBScYfscuYdu3csKUudxfUhTL6wnxxZRwbbkUK9DAgMBAAEC\ngYA9HdX3r5aY/TX+VphXtJN6oEHHQIGYqdV57FZCP+1ObsbQhhGS9Il7LVxAGNrv\n3etYtQPUQWifJzfwDeUv5QxDji3A9+CQ8uweA0F0OrfPLKbzX+cvN5VgIlYoWVwL\nD2j/vtysXUScLkvSw49ksdh/Zji54EOq2GdzMScP6eZi4QJBAO6TZ+gBASgG0zEB\n5OjHUm98n/r/tFwSsWAEKZCgKlE4z/kBS1NNC+e6EhA40CoqSRyrVisorXUHB/m3\nY7LKZvECQQCBBDfzUEmxwoyQBuAkTRiX/XNBmvmf1dpEkeKwwlvoEsX8OflqRarQ\nY9HtxzqKmoLoJmRnmTvSWuXdMOLf1YFzAkAvdXlNCK4fNURb0mGkAMqgTO1SM/2/\n9yP70rgmAgaJA8EzapN+baw5m6UuPu8CBElo/5hzm3Lt/ckTXuzhSywxAkAiSQS1\nXDi5TIIeJDWccACBI5FlddGwcBw47KvZXU0fNx32EVH+s9TY3C4FilQ8USNInitA\nfLAxDobXaQ5hfVORAkEAgArhzoUOwhuEaK9ZcXo79OBKZijAwXm/QnHXEhY93+Kf\nJP6j764SaZ3/J5lFPY7Ete4hd+cHhEsvDfFXxqlwPA==\n-----END RSA PRIVATE KEY-----",
                //    "userid2":451,
                //    "pubkey":"-----BEGIN PUBLIC KEY-----\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHsuHRTVs3A0KYqEJCnPuBSXSnbb\nr66yOF5Jm2Bxe+VLmaI5mL+mP4cjTa44k9/2vFZsi0+cjr3EP5QzXvD0Y9ZVaKBx\niB9oqU23CfOTSxcIYbOtx4lUT5n+CZjtnZV+fu0D9rHrekq91rteZVl9ht78G98Q\nt6LDYHUSM4XPegWzAgMBAAE=\n-----END PUBLIC KEY-----",
                //    "pubkey2":"AndZ699oakkQplSFu+5zmQ2zY8I/yOS4x100IUe8rDlL",
                //    "w2_start_mt_sent_at":1512476899253,
                //    "w2_end_mt_received_at":1512476929931
                //};
                delete session_info.ip_external ;
                delete session_info.prvkey ;
                delete session_info.userid2 ;
                delete session_info.pubkey ;
                delete session_info.pubkey2 ;
            } // cleanup_session_info

            // temporary save money transactions in memory and wait for send_mt request. all validations OK and chat msg with money transactions has been sent
            var new_money_transactions = {} ; // money_transactionid => {timestamp: new Date().getTime(), request: request, response: response}

            // listen for incoming messages from MN and other wallet sessions. called from MoneyNetworkAPILib.demon
            // params:
            // - inner_path: inner_path to new incoming message
            // - encrypt2: instance of MoneyNetworkAPI class created with new MoneyNetworkAPI request
            function process_incoming_message(inner_path, encrypt2, encrypted_json_str, request, extra) {
                var pos, response_timestamp, request_timestamp, request_timeout_at, error, response,
                    send_response, subsystem, file_timestamp, group_debug_seq, pgm, now, send_exception,
                    restart_receive_message, filename;
                pgm = service + '.process_incoming_message: ';

                try {
                    // get a group debug seq. track all connected log messages. there can be many running processes
                    if (extra && extra.group_debug_seq) group_debug_seq = extra.group_debug_seq ;
                    else group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start();
                    pgm = service + '.process_incoming_message/' + group_debug_seq + ': ';
                    console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this ' + (request && request.msgtype ? 'receive ' + request.msgtype + ' message' : 'process_incoming_message') + ' operation');
                    if (request && request.msgtype) MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {msgtype: request.msgtype});

                    if (encrypt2.destroyed) {
                        // MoneyNetworkAPI instance has been destroyed. Maybe deleted session?
                        console.log(pgm + 'ignoring incoming message ' + inner_path + '. session has been destroyed. reason = ' + encrypt2.destroyed);
                        return;
                    }
                    console.log(pgm + 'processing inner_path = ' + inner_path + (encrypt2.debug ? ' with ' + encrypt2.debug : ''));
                    console.log(pgm + 'now = ' + (new Date().getTime()) + ', extra = ' + JSON.stringify(extra)) ;

                    // get filename.
                    pos = inner_path.lastIndexOf('/') ;
                    filename = inner_path.substr(pos+1) ;
                    console.log(pgm + 'filename = ' + filename);

                    // get file timestamp. used in response. double link between request and response
                    pos = inner_path.lastIndexOf('.');
                    file_timestamp = parseInt(inner_path.substr(pos + 1));
                    console.log(pgm + 'file_timestamp = ' + file_timestamp);

                    if (!request) {
                        console.log(pgm + 'no request. fileGet or decrypt must have failed. extra = ' + JSON.stringify(extra)) ;
                        //extra = {
                        //    "optional_file": true,
                        //    "group_debug_seq": 437,
                        //    "file_info": {
                        //        "inner_path": "data/users/18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ/cd3d368a3b-o.1511428404811",
                        //        "uploaded": 0,
                        //        "is_pinned": 0,
                        //        "time_accessed": 0,
                        //        "site_id": 6,
                        //        "is_downloaded": 0,
                        //        "file_id": 17962,
                        //        "peer": 1,
                        //        "time_added": 1511428985,
                        //        "hash_id": 20096,
                        //        "time_downloaded": 0,
                        //        "size": 548
                        //    },
                        //    "timeout": true,
                        //    "db_query_at": 1511428985117,
                        //    "modified": 1511428438,
                        //    "fileget": true,
                        //    "decrypt": true,
                        //    "send_overhead": 34000,
                        //    "receive_overhead": 0,
                        //    "total_overhead": 34000
                        //};
                        // failed fileGet for incoming money transaction file?
                        if (encrypt2.hasOwnProperty('sender') && extra && extra.file_info && !extra.file_info.is_downloaded) {
                            // optional file download failed in wallet to wallet communication
                            error = ['Hanging money transaction', 'Timeout while waiting for ' + filename, 'Check ZeroPort/VPN status', 'Maybe restart ui-server', 'Maybe reload wallet page'] ;
                            report_error(pgm, error, {group_debug_seq: group_debug_seq, type: 'info'}) ;
                        }
                        return ;
                    }

                    // remove any response timestamp before validation (used in response filename)
                    response_timestamp = request.response;
                    delete request.response; // request received. must use response_timestamp in response filename
                    request_timestamp = request.request;
                    delete request.request; // response received. todo: must be a response to previous send request with request timestamp in request filename
                    request_timeout_at = request.timeout_at;
                    delete request.timeout_at; // request received. when does request expire. how long does other session wait for response

                    // request timeout? check with and without "total_overhead"
                    now = new Date().getTime() ;
                    if (request_timeout_at < now) {
                        console.log(pgm + 'timeout. file_timestamp = ' + file_timestamp + ', request_timeout_at = ' + request_timeout_at + ', now = ' + now + ', total_overhead = ' + extra.total_overhead) ;
                        console.log(pgm + 'extra = ' + JSON.stringify(extra)) ;
                        if (request_timeout_at + extra.total_overhead < now) {
                            console.log(pgm + 'error. request timeout. ignoring request = ' + JSON.stringify(request) + ', inner_path = ' + inner_path);
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'Timeout. Request is too old') ;
                            // sending timeout notification to other process
                            encrypt2.send_timeout_message(request.msgtype, 'W2: please resend ' + request.msgtype + ' request') ;
                            return;
                        }
                        else {
                            console.log(pgm + 'warning. request timeout. other session may reject response after timeout. processing request anyway');
                        }
                    }

                    console.log(pgm + 'request = ' + JSON.stringify(request));
                    response = {msgtype: 'response'};

                    // cb: post response callback. used in send_mt after sending OK response to MN
                    send_response = function (error, cb) {
                        if (!response_timestamp) {
                            // no response was requested
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                            return;
                        }
                        if (error) response.error = error;
                        if (!cb) cb = function () {};
                        // send response to other session
                        encrypt2.send_message(response, {timestamp: response_timestamp, msgtype: request.msgtype, request: file_timestamp, timeout_at: request_timeout_at, group_debug_seq: group_debug_seq}, function (res) {
                            var pgm = service + '.process_incoming_message send_message callback 3/' + group_debug_seq + ': ';
                            console.log(pgm + 'res = ' + JSON.stringify(res));
                            //
                            cb();
                        }); // send_message callback 3

                    }; // send_response

                    // stack dump in w2 + send JS exception to MN
                    send_exception = function (pgm, e) {
                        console.log(pgm + e.message);
                        console.log(e.stack);
                        return send_response(request.msgtype + ' request failed with JS error ' + e.message) ;
                    } ;

                    // restart this job. called from btc_cross_domain_error
                    restart_receive_message = function () {
                        process_incoming_message(inner_path, encrypt2, encrypted_json_str, request, extra) ;
                    } ;

                    // validate and process incoming json message and process
                    if (request && (typeof request.msgtype == 'string') && (request.msgtype.substr(0, 3) == 'w2_')) subsystem = 'w2';
                    error = MoneyNetworkAPILib.validate_json(pgm, request, null, subsystem);
                    if (error) response.error = 'message is invalid. ' + error;
                    else if (request.msgtype == 'ping') {
                        // simple ping from MN. checking connection. return OK response
                    }
                    else if (request.msgtype == 'password') {
                        // got a password response from MN. Must be a lost get_password response. todo: 607 matches in last W2 log check!
                        console.log(pgm + 'error. got a password message. should only get a password message as a get_password response!');
                        response_timestamp = null;
                    }
                    else if (request.msgtype == 'get_balance') {
                        // get balance request from MN. Return error or balance in test Bitcoins
                        (function get_balance(){
                            try {
                                var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                                if (!status.permissions || !status.permissions.get_balance) return send_response('get_balance operation is not authorized');
                                if (wallet_info.status != 'Open') {
                                    // wallet not open (not created, not logged in etc)
                                    if (!status.permissions.open_wallet) return send_response('open_wallet operation is not authorized');
                                    if (!request.open_wallet) return send_response('Wallet is not open and open_wallet was not requested');
                                    else if (!status.wallet_id || !status.wallet_password) return send_response('Wallet is not open and no wallet login was found');
                                    else if (request.close_wallet && !status.permissions.close_wallet) return send_response('close_wallet operation was requested but is not authorized');
                                    else {
                                        // open test bitcoin wallet (also get_balance request)
                                        btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                            try {
                                                if (error) {
                                                    // open wallet or get_balance request failed
                                                    if (wallet_info.status != 'Open') return send_response('Open wallet request failed with error = ' + error);
                                                    else {
                                                        response.error = 'Get balance request failed with error = ' + error;
                                                        // close wallet and send error
                                                        btcService.close_wallet(function (res) {
                                                            send_response();
                                                        });
                                                    }
                                                }
                                                // open wallet + get_balance request OK
                                                response.msgtype = 'balance';
                                                response.balance = [{
                                                    code: 'tBTC',
                                                    amount: parseFloat(wallet_info.confirmed_balance)
                                                }];
                                                response.balance_at = new Date().getTime();
                                                // close wallet and return balance info
                                                if (!request.close_wallet) send_response();
                                                else btcService.close_wallet(function (res) {
                                                    try { send_response() }
                                                    catch (e) { return send_exception(pgm, e) }
                                                });

                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        });
                                        return;
                                    }
                                }
                                else {
                                    // wallet already open. ignore open_wallet and close_wallet flags
                                    btcService.get_balance(function (error) {
                                        try {
                                            if (error) return send_response('Get balance request failed with error = ' + error);
                                            // get_balance request OK
                                            response.msgtype = 'balance';
                                            response.balance = [{code: 'tBTC', amount: parseFloat(wallet_info.confirmed_balance)}];
                                            response.balance_at = new Date().getTime();
                                            send_response();
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    });
                                    return;
                                }
                            }
                            catch (e) {return send_exception(pgm, e) } ;
                        })() ;
                        return ;
                        // end get_balance
                    }
                    else if (request.msgtype == 'prepare_mt_request') {
                        // step 1 in send money transaction(s) to contact
                        // got a prepare money transactions request from MN. Return error message or json to be included in chat message for each money transaction
                        (function prepare_mt_request() {
                            try {
                                var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                                var send_money, request_money, i, money_transaction, jsons, step_1_confirm,
                                    step_2_open_wallet, step_3_check_balance, step_4_get_new_address,
                                    step_5_close_wallet, step_6_done_ok, amount2;

                                // check amount. must be a number (round to 8 decimals) or a string with 8 decimals
                                for (i = 0; i < request.money_transactions.length; i++) {
                                    money_transaction = request.money_transactions[i];
                                    if (typeof money_transaction.amount == 'number') money_transaction.amount.toFixed(8);
                                    else {
                                        // string. must be bitcoin amount with 8 decimals
                                        amount2 = parseFloat(money_transaction.amount).toFixed(8) ;
                                        if (money_transaction.amount != amount2) return send_response('Expected amount in bitcoins with 8 decimals. "' + money_transaction.amount + '" != "' + amount2 + '"') ;
                                    }
                                }

                                // check permissions
                                send_money = 0;
                                request_money = 0;
                                jsons = [];
                                for (i = 0; i < request.money_transactions.length; i++) {
                                    money_transaction = request.money_transactions[i];
                                    amount2 = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount) ;
                                    if (money_transaction.action == 'Send') send_money = send_money + amount2;
                                    if (money_transaction.action == 'Request') request_money = request_money + amount2;
                                    jsons.push({});
                                }
                                console.log(pgm + 'send_money = ' + send_money + ', request_money = ' + request_money);
                                if (send_money && (!status.permissions || !status.permissions.send_money)) return send_response('send_money operation is not authorized');
                                if (request_money && (!status.permissions || !status.permissions.receive_money)) return send_response('receive_money operation is not authorized');

                                //request = {
                                //    "msgtype": "prepare_mt_request",
                                //    "money_transactions": [{
                                //        "action": "Send",
                                //        "code": "tBTC",
                                //        "amount": "0.00001"
                                //    }]
                                //};

                                // no fee calculation here. is done by blocktrail/btc when sending money and fee is subtracted from amount. added fee_info to wallet.json

                                // todo: do some validations without contacting external API (Blocktrails Node.js API)
                                // 1) send money: check amount >= balance
                                // 2) general: balance - send amount + (request amount-fee) >= 0
                                // 3) refresh balance before validation
                                // 4) what about already send but not yet effected money transactions?
                                //    a) send money: waiting for bitcoin address from other contact
                                //    b) request money: send bitcoin address to contact. waiting for bitcoin transaction to be submitted to blockchain
                                // 5) abort send but not yet effected money transactions? abort from wallet / abort from MN / abort from both contacts
                                // 6) wallet must keep a list of transactions (in process, cancelled and done)
                                // 7) create a session for direct wallet to wallet communication? (publish is needed when communicating between wallets)
                                // 8) or use MN chat messages from communication?
                                // 9) always call get_new_address.
                                //    - send money: return address in case of aborted operation after send money request has been sent to external API
                                //    - request money: address for send money operation

                                // callback chain definitions
                                // prepare_mt_request. step 6.
                                step_6_done_ok = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_6_done_ok/' + group_debug_seq + ': ';
                                    console.log(pgm + 'jsons = ' + JSON.stringify(jsons));

                                    // ready to send OK response with jsons to MN
                                    // jsons = [{"return_address":"2N23sTaKZT4SG1veLHrAxR1WLfNeqnBE4tT"}]
                                    response.msgtype = 'prepare_mt_response';
                                    response.jsons = jsons;
                                    // remember transactions and wait for send_mt request (chat msg has been sent)
                                    new_money_transactions[request.money_transactionid] = {
                                        timestamp: new Date().getTime(),
                                        request: request,
                                        response: response
                                    };
                                    console.log(pgm + 'new_money_transactions = ' + JSON.stringify(new_money_transactions));
                                    //new_money_transactions = {
                                    //    "vjbhtHwEfZUY4iF01hLHH9QBrm02pzslSqshK0Pu6G1QLEoKsFaJcwKiKvef": {
                                    //        "timestamp": 1508082035393,
                                    //        "request": {
                                    //            "msgtype": "prepare_mt_request",
                                    //            "contact": {
                                    //                "alias": "jro test",
                                    //                "cert_user_id": "jro@zeroid.bit",
                                    //                "auth_address": "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ"
                                    //            },
                                    //            "open_wallet": true,
                                    //            "money_transactions": [{
                                    //                "action": "Send",
                                    //                "code": "tBTC",
                                    //                "amount": 0.0001
                                    //            }],
                                    //            "money_transactionid": "vjbhtHwEfZUY4iF01hLHH9QBrm02pzslSqshK0Pu6G1QLEoKsFaJcwKiKvef"
                                    //        },
                                    //        "response": {
                                    //            "msgtype": "prepare_mt_response",
                                    //            "jsons": [{"return_address": "2N7YjtMs4irTnudkKwzxBMBaimhiKCuEKK4"}]
                                    //        }
                                    //    }
                                    //};

                                    send_response();
                                }; // step_6_done_ok

                                // prepare_mt_request step 5: optional close wallet. only if wallet has been opened in step 2
                                step_5_close_wallet = function () {
                                    if (request.close_wallet) btcService.close_wallet(function (res) {
                                        step_6_done_ok()
                                    });
                                    else return step_6_done_ok();
                                }; // step_5_close_wallet

                                // prepare_mt_request step 4: get new bitcoin address
                                // - send money - get return address to be used in case of a partly failed money transaction (multiple money transactions)
                                // - request money - address to be used in send money operation
                                step_4_get_new_address = function (i) {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_4_get_new_address/' + group_debug_seq + ': ';
                                    if (!i) i = 0;
                                    console.log(pgm + 'i = ' + i);
                                    if (i >= request.money_transactions.length) return step_5_close_wallet();
                                    btcService.get_new_address(function (error, address) {
                                        try {
                                            var money_transaction;
                                            if (error) {
                                                z_wrapper_notification(['error', 'Get new bitcoin address failed with<br>' + error]) ;
                                                return send_response('Could not get a new bitcoin address. error = ' + error);
                                            }
                                            money_transaction = request.money_transactions[i];
                                            if (money_transaction.action == 'Send') jsons[i].return_address = address;
                                            else jsons[i].address = address;
                                            step_4_get_new_address(i + 1);
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    }); // get_new_address
                                }; // step_4_get_new_address

                                // prepare_mt_request step 3: optional check balance. Only for send money operations
                                step_3_check_balance = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_3_check_balance/' + group_debug_seq + ': ';
                                    if (!send_money) return step_4_get_new_address();
                                    console.log(pgm + 'sending money. check wallet balance. send_money = ' + send_money + ', balance: ', wallet_info.confirmed_balance + ', unconfirmed Balance: ', wallet_info.unconfirmed_balance);
                                    if (wallet_info.confirmed_balance >= send_money) return step_4_get_new_address(); // OK
                                    if (wallet_info.unconfirmed_balance < send_money) send_response('insufficient balance for send money operation(s)');
                                    else send_response('insufficient balance confirmed balance for send money operation(s)');
                                }; // step_3_check_balance

                                // prepare_mt_request step 2: optional open wallet. wallet must be open before get new address request
                                step_2_open_wallet = function () {
                                    if (wallet_info.status == 'Open') {
                                        // bitcoin wallet is already open. never close an already open wallet
                                        request.close_wallet = false;
                                        // refresh balance. only for send money requests
                                        if (!send_money) return step_3_check_balance();
                                        // sending money. refresh balance.
                                        btcService.get_balance(function (error) {
                                            try {
                                                if (error) console.log(pgm + 'warning. sending money and get_balance request failed with error = ' + error);
                                                step_3_check_balance();
                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        });
                                    }
                                    else {
                                        // open test bitcoin wallet (also get_balance request)
                                        btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                            try {
                                                if (error && (wallet_info.status != 'Open')) {
                                                    z_wrapper_notification(['error', 'Open wallet request failed with<br>' + error]) ;
                                                    return send_response('Open wallet request failed with error = ' + error);
                                                }
                                                if (error && send_money) console.log(pgm + 'warning. sending money and get_balance request failed with error = ' + error);
                                                step_3_check_balance();
                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        });
                                    }
                                }; // step_2_open_wallet

                                // prepare_mt_request step 1: optional confirm money transaction (see permissions)
                                step_1_confirm = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_confirm/' + group_debug_seq + ': ';
                                    var message, request2, confirm_status, confirm_timeout_fnk;
                                    if (wallet_info.status != 'Open') {
                                        // wallet not open (not created, not logged in etc)
                                        if (!status.permissions.open_wallet) return send_response('Cannot send money transaction. Open wallet operation is not authorized');
                                        if (!request.open_wallet) return send_response('Cannot send money transaction. Wallet is not open and open_wallet was not requested');
                                        else if (!status.wallet_id || !status.wallet_password) return send_response('Cannot send money transaction. Wallet is not open and no wallet login was found');
                                    }
                                    if (request.close_wallet && !status.permissions.close_wallet) return send_response('Cannot send money transaction. Close wallet operation was requested but is not authorized');
                                    console.log(pgm + 'todo: add transactions details in confirm dialog');
                                    if (!status.permissions.confirm) return step_2_open_wallet();

                                    // open two confirm dialog boxes.
                                    // one here in W2 session. The other in MN session
                                    // timeout in prepare_mt_request request from MN is 60 seconds.
                                    // timeout in confirm dialog box is 50 seconds
                                    confirm_status = {done: false};
                                    confirm_timeout_fnk = function () {
                                        if (confirm_status.done) return; // confirm dialog done
                                        confirm_status.done = true;
                                        send_response('Confirm transaction timeout')
                                    };
                                    setTimeout(confirm_timeout_fnk, 50000);
                                    // path 1) confirm box in w2
                                    message = 'Send todo: more text money transaction(s) to ' + request.contact.alias + '?';
                                    ZeroFrame.cmd("wrapperConfirm", [message, 'OK'], function (confirm) {
                                        if (confirm_status.done) return; // confirm dialog done (OK or timeout)
                                        confirm_status.done = true ;
                                        if (!confirm) return send_response('money transaction(s) was/were rejected');
                                        // Money transaction was confirmed. continue
                                        step_2_open_wallet();
                                    }) ;
                                    // path 2) confirm box in MN
                                    request2 = {
                                        msgtype: 'confirm',
                                        message: message,
                                        button_caption: 'OK'
                                    };
                                    console.log(pgm + 'sending request2 = ' + JSON.stringify(request2));
                                    encrypt2.send_message(request2, {response: 50000, group_debug_seq: group_debug_seq}, function (response) {
                                        try {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_confirm send_message callback 1/' + group_debug_seq + ': ';
                                            if (confirm_status.done) return; // confirm dialog done (OK or timeout)
                                            confirm_status.done = true ;
                                            // response should be OK or timeot
                                            if (response && !response.error) {
                                                // Money transaction was confirmed. continue
                                                return step_2_open_wallet() ;
                                            }
                                            if (response && response.error && response.error.match(/^Timeout /)) {
                                                // OK. timeout after 50 seconds. No or late user feedback in MN session
                                                return;
                                            }
                                            // unexpected response from confirm request
                                            console.log(pgm + 'error: response = ' + JSON.stringify(response)) ;
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    }); // send_message callback 1

                                }; // step_1_confirm

                                // start callback chain
                                step_1_confirm();
                            }
                            catch (e) { return send_exception(pgm, e) }
                        })() ;
                        return;
                        // end prepare_mt_request
                    }
                    else if (request.msgtype == 'send_mt') {
                        // step 2 in send money transaction(s) to contact
                        // MN session has just sent chat msg with money transaction(s) to contact.
                        (function send_mt(){
                            try {
                                var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                                var now, elapsed;
                                now = new Date().getTime();
                                if (!new_money_transactions[request.money_transactionid]) return send_response('Unknown money transactionid');
                                // max 60 seconds between prepare_mt_response and send_mt requests
                                elapsed = now - new_money_transactions[request.money_transactionid].timestamp;
                                if (elapsed > 60000) return send_response('Timeout. Waited ' + Math.round(elapsed / 1000) + ' seconds');

                                // OK send_mt request
                                console.log(pgm + 'sending OK response to ingoing send_mt request');
                                send_response(null, function () {

                                    try {
                                        var group_debug_seq, pgm, step_1_check_port, step_2_get_pubkey, step_3_get_pubkey2, step_4_create_session,
                                            step_5_save_pubkeys_msg, step_6_save_in_ls, step_7_publish, session_info, i,
                                            money_transactions, encrypt3, reason;

                                        // get a new group debug seq for send_mt post processing.
                                        group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start();
                                        pgm = service + '.process_incoming_message.' + request.msgtype + ' send_response callback/' + group_debug_seq + ': ';
                                        console.log(pgm + 'OK send_mt response was send to MN. MN is sending chat msg with money transactions to contact. continue with send_mt post processing here in W2');
                                        console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this post send_mt processing operation');

                                        // capture details for new wallet to wallet money transaction
                                        // must be temporary saved in localStorage until money transaction is processed
                                        session_info = {
                                            money_transactionid: request.money_transactionid,
                                            sender: true,
                                            contact: new_money_transactions[request.money_transactionid].request.contact,
                                            money_transactions: [],
                                            files: {}
                                        };
                                        money_transactions = new_money_transactions[request.money_transactionid].request.money_transactions;
                                        for (i = 0; i < money_transactions.length; i++) {
                                            session_info.money_transactions.push({
                                                action: money_transactions[i].action,
                                                code: money_transactions[i].code,
                                                amount: money_transactions[i].amount,
                                                json: new_money_transactions[request.money_transactionid].response.jsons[i]
                                            });
                                        }
                                        reason = request.msgtype ;

                                        // post send_mt tasks:
                                        // 1: warning if ZeroNet port is closed. optional files are not distributed. maybe use small normal files as a backup?
                                        // 2: encryption layer 1. jsencrypt. generate a short jsencrypt key (1024) bits. only used for this transaction
                                        // 3: encryption layer 2. select random index for cryptmessage public key and find public cryptmessage key
                                        // 4: send offline pubkeys message to other wallet session encrypted with money_transactionid (encryption layer 3) and
                                        //    create a <session filename>.0000000000001 file with transaction status encrypted with money_transactionid (encryption layer 3)
                                        // 5: save transaction in ls
                                        // 6: publish so that other MN and W2 sessions can new the new optional files

                                        // create callback chain step 1-7

                                        // send_mt step 7: publish
                                        step_7_publish = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_7_publish/' + group_debug_seq + ': ';
                                            console.log(pgm + 'publish pubkeys message for other wallet session. publishing via MN publish queue. max one publish once every 30 seconds');
                                            z_publish({publish: true, reason: reason, group_debug_seq: group_debug_seq});
                                        }; // step_7_publish

                                        // send_mt step 6: save session and money transaction(s) in ls
                                        step_6_save_in_ls = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_6_save_in_ls/' + group_debug_seq + ': ';
                                            delete session_info.pubkey;
                                            delete session_info.pubkey2;
                                            save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                try {
                                                    console.log(pgm + 'OK. Saved wallet-wallet session information in localStorage');
                                                    step_7_publish();
                                                }
                                                catch (e) { return send_exception(pgm, e) }
                                            });
                                        }; // step_6_save_in_ls

                                        // send_mt step 5. send offline pubkeys message to other wallet session
                                        step_5_save_pubkeys_msg = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_5_save_pubkeys_msg/' + group_debug_seq + ': ';
                                            var request2, error, options;
                                            request2 = {
                                                msgtype: 'w2_pubkeys',
                                                pubkey: session_info.pubkey, // for JSEncrypt
                                                pubkey2: session_info.pubkey2 // for cryptMessage
                                            };
                                            console.log(pgm + 'request2 = ' + JSON.stringify(request2));
                                            // send offline message. no wait for response. use optional offline file (-o) or normal file
                                            options = {
                                                encryptions: [3],
                                                optional: session_info.ip_external ? 'o' : null,
                                                subsystem: 'w2',
                                                files: session_info.files,
                                                status: '1: pubkeys sent, waiting for w2_check_mt',
                                                group_debug_seq: group_debug_seq
                                            } ;
                                            encrypt3.send_message(request2, options, function (response2, request_filename) {
                                                try {
                                                    var error;
                                                    if (!response2 || response2.error) {
                                                        error = ['Money transaction post processing failed', 'pubkeys message was not send', 'error = ' + JSON.stringify(response2)];
                                                        report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                        return;
                                                    }
                                                    console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                    console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                    console.log(pgm + 'sent pubkeys message to other wallet session');
                                                    if (!ls.w_files) ls.w_files = {} ;
                                                    ls.w_files[request_filename] = true ;
                                                    reason = request_filename ;
                                                    session_info.this_status = options.status ;
                                                    step_6_save_in_ls();
                                                }
                                                catch (e) { return send_exception(pgm, e) }
                                            }); // encrypt_json callback
                                        }; // step_5_save_pubkeys_msg

                                        // send_mt step 4. create wallet to wallet session. expects incoming pubkeys message from other wallet session
                                        step_4_create_session = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_4_create_session/' + group_debug_seq + ': ';
                                            // setup session instance.
                                            // Only using symmetric encryption in first pubkeys message to other wallet session
                                            // this wallet starts the transaction and is the sender in wallet to wallet communication
                                            // todo: 1) add this session keys information to encrypt3
                                            // todo: 2) encrypt3 instance should be saved in ls and should be restored after page reload (step_5_save_in_ls)
                                            encrypt3 = new MoneyNetworkAPI({
                                                debug: 'encrypt3',
                                                sessionid: session_info.money_transactionid,
                                                sender: true,
                                                prvkey: session_info.prvkey,
                                                userid2: session_info.userid2
                                            });
                                            console.log(pgm + 'created wallet-wallet session. waiting for pubkeys message from other wallet session');
                                            step_5_save_pubkeys_msg();
                                        }; // step_4_create_session

                                        // send_mt step 3. generate public/private keyset for wallet to wallet communication. cryptMessage. encryption layer 2
                                        step_3_get_pubkey2 = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_3_get_pubkey2/' + group_debug_seq + ': ';
                                            var r, debug_seq;
                                            r = Math.random();
                                            session_info.userid2 = parseInt(('' + r).substr(2, 3)); // 0-999
                                            debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'userPublickey', null, group_debug_seq);
                                            ZeroFrame.cmd("userPublickey", [session_info.userid2], function (pubkey2) {
                                                try {
                                                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, pubkey2 ? 'OK' : 'Error. Not found');
                                                    session_info.pubkey2 = pubkey2;
                                                    console.log(pgm + 'Generated new cryptMessage pubkey/prvkey set');
                                                    // console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                                    step_4_create_session();
                                                }
                                                catch (e) { return send_exception(pgm, e) }
                                            }); // userPublickey
                                        }; // step_3_get_pubkey2

                                        // send_mt step 2. generate public/private keyset for wallet to wallet communication. JSEncrypt. encryption layer 1
                                        step_2_get_pubkey = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_2_get_pubkey/' + group_debug_seq + ': ';
                                            var crypt;
                                            crypt = new JSEncrypt({default_key_size: 1024});
                                            crypt.getKey();
                                            session_info.pubkey = crypt.getPublicKey();
                                            session_info.prvkey = crypt.getPrivateKey(); // todo: save prvkey in W2 lS encrypted with ...
                                            console.log(pgm + 'Generated new JSEncrypt pubkey/prvkey set');
                                            step_3_get_pubkey2();
                                        }; // step_2_get_pubkey

                                        // send_mt step 1. check if zeronet port is open. required for optional files distribution (money transactions)
                                        step_1_check_port = function () {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_check_port/' + group_debug_seq + ': ';
                                            check_port(pgm, session_info, group_debug_seq, send_exception, step_2_get_pubkey) ;
                                        }; // step_1_check_port

                                        // start callback chain
                                        step_1_check_port();
                                        if ((response.msgtype == 'response') && !response.error) return; // stop. OK send_mt response has already been sent
                                    }
                                    catch (e) { return send_exception(pgm, e) }
                                }); // send_response callback
                            }
                            catch (e) { return send_exception(pgm, e) }
                        })() ;
                        return ;
                        // end send_mt
                    }
                    else if (request.msgtype == 'check_mt') {
                        // step 3 in send money transaction(s) to contact
                        // MN session has received chat msg with money transaction(s) from contact and user has clicked Approve.
                        // Check if incoming money transaction is OK
                        (function check_mt(){
                            try {
                                var send_money, request_money, jsons, i, money_transaction, step_1_load_session, step_2_confirm,
                                    step_3_open_wallet, step_4_check_balance, step_5_get_new_address, step_6_more, amount2;

                                console.log(pgm + 'request = ' + JSON.stringify(request));
                                //request = {
                                //    "msgtype": "check_mt",
                                //    "contact": {
                                //        "alias": "1MirY1KnJK3MK",
                                //        "cert_user_id": "1MirY1KnJK3MK@moneynetwork.bit",
                                //        "auth_address": "1MirY1KnJK3MKzgZiyZZM8FkyzHRJgmMh8"
                                //    },
                                //    "open_wallet": true,
                                //    "money_transactions": [{
                                //        "action": "Send",
                                //        "code": "tBTC",
                                //        "amount": 0.0001,
                                //        "json": {"return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V"}
                                //    }],
                                //    "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA"
                                //};

                                // check amount. must be a number (round to 8 decimals) or a string with 8 decimals
                                for (i = 0; i < request.money_transactions.length; i++) {
                                    money_transaction = request.money_transactions[i];
                                    if (typeof money_transaction.amount == 'number') money_transaction.amount.toFixed(8);
                                    else {
                                        // string. must be bitcoin amount with 8 decimals
                                        amount2 = parseFloat(money_transaction.amount).toFixed(8) ;
                                        if (money_transaction.amount != amount2) return send_response('Expected amount in bitcoins with 8 decimals. "' + money_transaction.amount + '" != "' + amount2 + '"') ;
                                    }
                                }

                                // check permissions. reverse action from incoming money transaction (send <=> request)
                                send_money = 0;
                                request_money = 0;
                                jsons = [];
                                for (i = 0; i < request.money_transactions.length; i++) {
                                    money_transaction = request.money_transactions[i];
                                    if (!money_transaction.json) return send_response('Invalid money transaction without json');
                                    amount2 = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount) ;
                                    if (money_transaction.action == 'Send') {
                                        if (!money_transaction.json.return_address) return send_response('Invalid send money transaction without a return address');
                                        request_money = request_money + amount2;
                                    } // reverse action
                                    if (money_transaction.action == 'Request') {
                                        if (!money_transaction.json.address) return send_response('Invalid request money transaction without an address');
                                        send_money = send_money + amount2;
                                    } // reverse action
                                    jsons.push({});
                                }
                                console.log(pgm + 'send_money = ' + send_money + ', request_money = ' + request_money);
                                if (send_money && (!status.permissions || !status.permissions.send_money)) return send_response('send_money operation is not authorized');
                                if (request_money && (!status.permissions || !status.permissions.receive_money)) return send_response('receive_money operation is not authorized');
                                // aray with empty jsons - see step_5_get_new_address
                                console.log(pgm + 'jsons (empty json array) = ' + JSON.stringify(jsons)) ;

                                // check_mt step 6:
                                step_6_more = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_6_more/' + group_debug_seq + ': ';
                                    var error, i, money_transaction;
                                    console.log(pgm + 'request = ' + JSON.stringify(request));
                                    //request = {
                                    //    "msgtype": "check_mt",
                                    //    "contact": {
                                    //        "alias": "1MirY1KnJK3MK",
                                    //        "cert_user_id": "1MirY1KnJK3MK@moneynetwork.bit",
                                    //        "auth_address": "1MirY1KnJK3MKzgZiyZZM8FkyzHRJgmMh8"
                                    //    },
                                    //    "open_wallet": true,
                                    //    "money_transactions": [{
                                    //        "action": "Send",
                                    //        "code": "tBTC",
                                    //        "amount": 0.0001,
                                    //        "json": {"return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V"}
                                    //    }],
                                    //    "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA"
                                    //};
                                    console.log(pgm + 'jsons (one address per money transaction) = ' + JSON.stringify(jsons));
                                    //jsons = [{"address": "2MtDgneBKY5AaiJBEFWQFnACu9kuNqLCpNG"}];

                                    // control. there should be an address and a return_address for each money transaction
                                    // address: for send money operation
                                    // return_address: used in case of partial failed money transactions (multiple money transaction in a chat message)
                                    if (jsons.length != request.money_transactions.length) {
                                        error = 'System error in check_mt processing. Expected request.money_transactions.length = ' + request.money_transactions.length + '. found jsons.length = ' + jsons.length;
                                        console.log(pgm + error);
                                        return send_response(error);
                                    }
                                    for (i = 0; i < request.money_transactions.length; i++) {
                                        money_transaction = request.money_transactions[i];
                                        if (money_transaction.action == 'Send') {
                                            // received a send money transaction from other contact
                                            // expects a return_address in request and expects an address in jsons
                                            if (!money_transaction.json || !money_transaction.json.return_address || !jsons[i].address) {
                                                error = 'System error in check_mt processing. Expected addresses were not found. Action = ' + money_transaction.action + ', money_transaction.json = ' + JSON.stringify(money_transaction.json) + ', jsons[' + i + '] = ' + JSON.stringify(jsons[i]);
                                                console.log(pgm + error);
                                                return send_response(error);
                                            }
                                        }
                                        else {
                                            // received a request money transaction from other contact
                                            // expects an address in request and a return_address in jsons
                                            if (!money_transaction.json || !money_transaction.json.address || !jsons[i].return_address) {
                                                error = 'System error in check_mt processing. Expected addresses were not found. Action = ' + money_transaction.action + ', money_transaction.json = ' + JSON.stringify(money_transaction.json) + ', jsons[' + i + '] = ' + JSON.stringify(jsons[i]);
                                                console.log(pgm + error);
                                                return send_response(error);
                                            }
                                        }
                                    }

                                    // ready to send OK response to MN
                                    // temporary remember request and new addresses (jsons) and wait for start_mt request (all validations OK and ready to execute money transactions)
                                    new_money_transactions[request.money_transactionid] = {
                                        timestamp: new Date().getTime(),
                                        request: request,
                                        jsons: jsons
                                    };
                                    console.log(pgm + 'new_money_transactions = ' + JSON.stringify(new_money_transactions));
                                    //new_money_transactions = {
                                    //    "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA": {
                                    //        "timestamp": 1508858239692,
                                    //        "request": {
                                    //            "msgtype": "check_mt",
                                    //            "contact": {
                                    //                "alias": "1MirY1KnJK3MK",
                                    //                "cert_user_id": "1MirY1KnJK3MK@moneynetwork.bit",
                                    //                "auth_address": "1MirY1KnJK3MKzgZiyZZM8FkyzHRJgmMh8"
                                    //            },
                                    //            "open_wallet": true,
                                    //            "money_transactions": [{
                                    //                "action": "Send",
                                    //                "code": "tBTC",
                                    //                "amount": 0.0001,
                                    //                "json": {"return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V"}
                                    //            }],
                                    //            "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA"
                                    //        },
                                    //        "jsons": [{"address": "2Myvri78Uh6aTXsVT9u3qELwqbuQ5sU2WCF"}]
                                    //    }
                                    //};
                                    send_response(null);

                                }; // step_6_more

                                // check_mt step 5: get new bitcoin address
                                // - send money - address to be used in send money operation (return_address is already in request)
                                // - request money - return address to be used in case of a partly failed money transaction (address is already in request)
                                step_5_get_new_address = function (i) {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_5_get_new_address/' + group_debug_seq + ': ';
                                    var money_transaction;
                                    if (!i) i = 0;
                                    console.log(pgm + 'i = ' + i);
                                    if (i >= request.money_transactions.length) return step_6_more();
                                    money_transaction = request.money_transactions[i];
                                    // check old session info
                                    if ((money_transaction.action == 'Send') && (jsons[i].address)) {
                                        // address already added. loaded from old session info in step_1_load_session
                                        return step_5_get_new_address(i + 1) ;
                                    }
                                    if ((money_transaction.action == 'Request') && (jsons[i].return_address)) {
                                        // return_address already added. loaded from old session info in step_1_load_session
                                        return step_5_get_new_address(i + 1) ;
                                    }
                                    // get new bitcoin address from btc
                                    btcService.get_new_address(function (error, address) {
                                        try {
                                            if (error) return send_response('Could not get a new bitcoin address. error = ' + error);
                                            if (money_transaction.action == 'Send') jsons[i].address = address; // ingoing send money: other wallet must send test bitcoins to this address
                                            else jsons[i].return_address = address; // ingoing request money. address is already in request. other wallet must use return_address in case of a failed money transfer operation
                                            step_5_get_new_address(i + 1);
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    }); // get_new_address
                                }; // step_4_get_new_address

                                // check_mt step 4: optional check balance. Only for request money operations
                                step_4_check_balance = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_4_check_balance/' + group_debug_seq + ': ';
                                    if (!send_money) return step_5_get_new_address();
                                    console.log(pgm + 'sending money. check wallet balance. send_money = ' + send_money + ', balance: ', wallet_info.confirmed_balance + ', unconfirmed Balance: ', wallet_info.unconfirmed_balance);
                                    if (wallet_info.confirmed_balance >= send_money) return step_5_get_new_address(); // OK
                                    if (wallet_info.unconfirmed_balance < send_money) send_response('insufficient balance for money request(s)');
                                    else send_response('insufficient balance confirmed balance for money request(s)');
                                }; // step_4_check_balance

                                // check_mt step 3: optional open wallet. wallet must be open before processing incoming money transaction(s)
                                step_3_open_wallet = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_3_open_wallet/' + group_debug_seq + ': ';
                                    if (wallet_info.status == 'Open') {
                                        // bitcoin wallet is already open. never close an already open wallet
                                        request.close_wallet = false;
                                        // check balance. only incoming request money transactions
                                        if (!send_money) return step_4_check_balance();
                                        // sending money. refresh balance.
                                        btcService.get_balance(function (error) {
                                            try {
                                                if (error) console.log(pgm + 'warning. money request and get_balance request failed with error = ' + error);
                                                return step_4_check_balance();
                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        });
                                    }
                                    else {
                                        // open test bitcoin wallet (also get_balance request)
                                        btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                            try {
                                                if (error && (wallet_info.status != 'Open')) return send_response('Open wallet request failed with error = ' + error);
                                                if (error && send_money) console.log(pgm + 'warning. money request and get_balance request failed with error = ' + error);
                                                step_4_check_balance();
                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        });
                                    }
                                }; // step_3_open_wallet

                                // check_mt step 2: optional confirm money transaction (see permissions)
                                step_2_confirm = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_2_confirm/' + group_debug_seq + ': ';
                                    var request2;
                                    if (wallet_info.status != 'Open') {
                                        // wallet not open (not created, not logged in etc)
                                        if (!status.permissions.open_wallet) return send_response('Cannot receive money transaction. Open wallet operation is not authorized');
                                        if (!request.open_wallet) return send_response('Cannot receive money transaction. Wallet is not open and open_wallet was not requested');
                                        else if (!status.wallet_id || !status.wallet_password) return send_response('Cannot receive money transaction. Wallet is not open and no wallet login was found');
                                    }
                                    if (request.close_wallet && !status.permissions.close_wallet) return send_response('Cannot receive money transaction. Close wallet operation was requested but is not authorized');
                                    console.log(pgm + 'todo: add transactions details in confirm dialog');
                                    if (!status.permissions.confirm) return step_3_open_wallet();
                                    // send confirm notification to MN
                                    request2 = {
                                        msgtype: 'notification',
                                        type: 'info',
                                        message: 'Please confirm money transaction<br>todo: more text',
                                        timeout: 10000
                                    };
                                    console.log(pgm + 'sending request2 = ' + JSON.stringify(request2));
                                    encrypt2.send_message(request2, {response: false}, function (response) {
                                        try {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_2_confirm send_message callback 1/' + group_debug_seq + ': ';
                                            var message, confirm_status, confirm_timeout_fnk;
                                            if (response && response.error) return send_response('Confirm transaction failed. error = ' + response.error);
                                            // open confirm dialog. handle confirm timeout. wait max 2+10 seconds for confirmation
                                            confirm_status = {done: false};
                                            confirm_timeout_fnk = function () {
                                                if (confirm_status.done) return; // confirm dialog done
                                                confirm_status.done = true;
                                                send_response('Confirm transaction timeout')
                                            };
                                            setTimeout(confirm_timeout_fnk, 12000);
                                            // todo: 1) add transaction details to confirm text
                                            // todo: 2) add plural to message: transaction(s)
                                            message = 'Receive todo: more text money transaction(s) from ' + request.contact.alias + '?';
                                            ZeroFrame.cmd('wrapperConfirm', [message, 'OK'], function (confirm) {
                                                try {
                                                    if (confirm_status.done) return; // confirm dialog timeout
                                                    confirm_status.done = true;
                                                    if (!confirm) return send_response('money transaction(s) was rejected');
                                                    // Money transaction was confirmed. continue
                                                    step_3_open_wallet();
                                                }
                                                catch (e) { return send_exception(pgm, e) }
                                            }); // wrapperConfirm callback 2
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    }); // send_message callback 1

                                }; // step_1_confirm

                                // check_mt step 1: load old wallet session from ls. only in case of retry approve incoming money transactions
                                step_1_load_session = function () {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_load_old_session/' + group_debug_seq + ': ';
                                    console.log(pgm + 'load any old transaction information for this transactionid from ls. maybe a second approve money transaction');
                                    read_w_session(request.money_transactionid, {group_debug_seq: group_debug_seq}, function (old_session_info) {
                                        try {
                                            var i, old_money_transaction ;
                                            if (!old_session_info) return step_2_confirm();

                                            console.log(pgm + 'warning. found old wallet session in ls. old_session_info = ' + JSON.stringify(old_session_info));
                                            //old_session_info = {
                                            //    "money_transactionid": "dGvvnMydn8HLhCkInrLLJU3pxMljoWlGEow2GqbZfnDf1WzFeLERtoAI3r50",
                                            //    "sender": false,
                                            //    "contact": {
                                            //        "alias": "jro",
                                            //        "cert_user_id": "jro@zeroid.bit",
                                            //        "auth_address": "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ"
                                            //    },
                                            //    "money_transactions": [{
                                            //        "action": "Send",
                                            //        "code": "tBTC",
                                            //        "amount": 0.001,
                                            //        "json": {
                                            //            "return_address": "2NEu38hyH9f5oLjekWZEERjWoEoCRRdzWfn",
                                            //            "address": "2Mt1mLHk3F9H12PoP5UUSTdPqfqXgnSTc5i"
                                            //        }
                                            //    }],
                                            //    "ip_external": false,
                                            //    "prvkey": "-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQCmh3aLbQazJ5+NjHCQi1w0N4uU1GAEAqGB8lX3dS+NF9AGu8xO\nfpjBdFPZVx/Kqe0KbVTPHvdIYWyhwblPSZS9F/mqtlMYxSKuN2Nr0mZmfX0LsobY\n/eYMwXiTY8osMjh7rZsXQUtsBZqJg5opaJISn1AEBSLNt1gTEggvgRrW7wIDAQAB\nAoGBAIeXsQxhn5zsXFuyyEzJTDAwMfTi37MkOUFHgnvU7PzjMLzq2LXpGpQaFdPX\nvskThzCASRfETPCgcwVaaXqHnRTyXXQcqEfe8pAKidbleViH/TcGClWOg0KDKA57\nlv8hlk59dLFi8BMbNlvjcbUZsysV8UV8KWxNu6SFsmD9eB2xAkEAzswzzJ95NzYR\n1olLL6Le66w5hHQjyygJxqQXpf/DvaHhMdAZ1nJV36N9IWfSCpsRRqiwk9401piW\n0Cj1i/mKfQJBAM4mjc4/uYCnCyLLDoOxzFuztwosGQJhW+I0+IiZbrfScjSfT2XB\ndrvAsDT1eoQLpkumoNZRBTBFMqiPro4HNtsCQQCNooJfxWGqFNhGzaW3LJ/tXfnO\n5BSX0gZQDJc91FzmBndMPLFVlN2H3FuZg5fyN56vfF3kCK67w6qXS1ZR1kmpAkBO\nbnCpNal3/xXHiQXeqPidMwTCxABH3Y69w3WDUwzCtzhoOOxWRILN8AOaQoL4Vg5Q\n3fZ3U5/ru4gIhZHdy3TdAkAERv5x7XQXEFAhvyM6Ch1zA2Mc0p5kcvyOH6JLUdtB\n5WJ/Dv8opbSD/jeHS7KV3bp/llMrSkFaoFPI8X6iRyC/\n-----END RSA PRIVATE KEY-----",
                                            //    "userid2": 461
                                            //};

                                            if (old_session_info.pubkeys_sent_at) {
                                                return send_response('Money transaction is already approved') ;
                                            }

                                            // use old addresses from old_session_info.money_transactions.json. step_5_get_new_address must use old addresses, not request new addresses
                                            console.log(pgm + 'jsons (empty jsons) = ' + JSON.stringify(jsons)) ;
                                            //jsons (empty jsons) = [{}];

                                            if (old_session_info.money_transactions.length != jsons.length) {
                                                return send_response(
                                                    'Money transaction failed. Found old session information with an other number of transactions. ' +
                                                    old_session_info.money_transactions.length + 'row(s) in old session info. ' +
                                                    jsons.length + ' row(s) in this money transaction');
                                            }
                                            for (i=0 ; i < jsons.length ; i++) {
                                                old_money_transaction = old_session_info.money_transactions[i] ;
                                                if (old_money_transaction.action == 'Send') {
                                                    // other contact is sending test bitcoins to this session.
                                                    // return_address in incoming money transaction and address must be added by this session
                                                    // but use any already generated address from old session info
                                                    if (old_money_transaction.json.address) jsons[i].address = old_money_transaction.json.address ;
                                                }
                                                else {
                                                    // other contact is requesting test bitcoins from this session.
                                                    // address in incoming money transaction and return_address must be added by this session
                                                    // but use any already generated return_address from old session info
                                                    if (old_money_transaction.json.return_address) jsons[i].return_address = old_money_transaction.json.return_address ;
                                                }
                                            } // for i
                                            console.log(pgm + 'jsons (with old addresses) = ' + JSON.stringify(jsons)) ;

                                            // todo: skip step_3_open_wallet if all bitcoins addresses were found in old session info

                                            step_2_confirm();
                                        }
                                        catch (e) { return send_exception(pgm, e) }
                                    }); // read_w_session callback

                                }; // step_1_load_session

                                // start callback chain
                                step_1_load_session();
                            }
                            catch (e) { return send_exception(pgm, e) }
                        })() ;
                        return ;
                        // end check_mt
                    }
                    else if (request.msgtype == 'start_mt') {
                        // step 4 in send money transaction(s) to contact
                        // received money transaction(s) has been checked by wallet(s) with OK response
                        // MN session sends start money transaction signal to wallet(s)
                        // rest of money transaction process should be 100% wallet to wallet communication
                        // MN clients should be informed about status changes in money transactions
                        // MN clients may send a cancel signal to wallet(s)
                        // wallets may allow a MN cancel signal to abort money transaction processing
                        (function start_mt() {
                            try {
                                var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                                var now, elapsed;
                                now = new Date().getTime();
                                if (!new_money_transactions[request.money_transactionid]) return send_response('Unknown money transactionid');
                                // max 60 seconds between check_mt and send_mt requests
                                elapsed = now - new_money_transactions[request.money_transactionid].timestamp;
                                if (elapsed > 60000) return send_response('Timeout. Waited ' + Math.round(elapsed / 1000) + ' seconds');

                                // OK send_mt request
                                console.log(pgm + 'sending OK response to ingoing start_mt request');
                                send_response(null, function () {
                                    try {
                                        // OK send_mt response has been sent to mn. get a new group debug seq for this start_mt post processing.
                                        var group_debug_seq, pgm;
                                        group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start();
                                        pgm = service + '.process_incoming_message.' + request.msgtype + ' send_response callback 1/' + group_debug_seq + ': ';
                                        console.log(pgm + 'OK start_mt response was send to MN. continue with start_mt post processing');
                                        console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this post start_mt processing operation');

                                        // normally no session_info in localStarage at start for start_mt post processing.
                                        // but check any way. Maybe a second approve incoming money transaction try
                                        read_w_session(request.money_transactionid, {group_debug_seq: group_debug_seq}, function (old_session_info)  {
                                            try {
                                                pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 2/' + group_debug_seq + ': ';
                                                var step_1_check_port, step_2_get_pubkey, step_3_get_pubkey2, step_4_create_session,
                                                    step_5_save_pubkeys_msg, step_6_save_in_ls, step_7_publish, i, money_transactions,
                                                    jsons, money_transaction, key, encrypt4, new_session_info, session_info, readonly_keys,
                                                    null_keys, errors, request2, reason ;

                                                if (old_session_info) {
                                                    console.log(pgm + 'warning. found old session info in localStorage. old_session_info = ' + JSON.stringify(old_session_info)) ;
                                                    if (old_session_info.pubkeys_sent_at) {
                                                        error = ['Stopping post start_mt processing', 'pubkeys message has already been sent to other wallet'] ;
                                                        return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                    }
                                                    console.log(pgm + 'continue with old session info. cross checking old and new session info. should be identical') ;
                                                }

                                                // capture details for new wallet to wallet money transaction
                                                // must be temporary saved in localStorage until money transaction is processed
                                                // request.contact = {"alias":"1MirY1KnJK3MK","cert_user_id":"1MirY1KnJK3MK@moneynetwork.bit","auth_address":"1MirY1KnJK3MKzgZiyZZM8FkyzHRJgmMh8"}
                                                new_session_info = {
                                                    money_transactionid: request.money_transactionid,
                                                    sender: false,
                                                    contact: new_money_transactions[request.money_transactionid].request.contact,
                                                    money_transactions: [],
                                                    files: {}
                                                };
                                                money_transactions = new_money_transactions[request.money_transactionid].request.money_transactions;
                                                jsons = new_money_transactions[request.money_transactionid].jsons;
                                                for (i = 0; i < money_transactions.length; i++) {
                                                    money_transaction = {
                                                        action: money_transactions[i].action,
                                                        code: money_transactions[i].code,
                                                        amount: money_transactions[i].amount,
                                                        json: {}
                                                    };
                                                    for (key in money_transactions[i].json)  money_transaction.json[key] = money_transactions[i].json[key];
                                                    for (key in jsons[i]) money_transaction.json[key] = jsons[i][key];
                                                    new_session_info.money_transactions.push(money_transaction);
                                                }
                                                console.log(pgm + 'new_session_info = ' + JSON.stringify(new_session_info));
                                                //session_info = {
                                                //    "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA",
                                                //    "sender": false,
                                                //    "money_transactions": [{
                                                //        "action": "Send",
                                                //        "code": "tBTC",
                                                //        "amount": 0.0001,
                                                //        "json": {
                                                //            "return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V",
                                                //            "address": "2NAXS7epN81nEH3XC37shuvH6uSjrdqvhNY"
                                                //        }
                                                //    }]
                                                //};

                                                if (old_session_info) {
                                                    if (JSON.stringify(old_session_info) != JSON.stringify(new_session_info)) {
                                                        readonly_keys = ['money_transactionid', 'sender','contact','money_transactions'] ;
                                                        null_keys = ['prvkey', 'userid2'] ;
                                                        errors = [] ;
                                                        for (i=0 ; i<readonly_keys.length ; i++) {
                                                            key = readonly_keys[i] ;
                                                            if (JSON.stringify(old_session_info[key]) != JSON.stringify(new_session_info[key])) {
                                                                errors.push(key + ': old value = ' + JSON.stringify(old_session_info[key]) + ', new value = ' + JSON.stringify(new_session_info[key])) ;
                                                            }
                                                        }
                                                        for (i=0 ; i<null_keys.length ; i++) {
                                                            key = null_keys[i] ;
                                                            if (!new_session_info.hasOwnProperty(key)) continue ; // using old private keys in step_2_get_pubkey and step_3_get_pubkey2
                                                            if (JSON.stringify(old_session_info[key]) != JSON.stringify(new_session_info[key])) {
                                                                errors.push(key + ' : old value = ' + JSON.stringify(old_session_info[key]) + ', new value = ' + JSON.stringify(new_session_info[key])) ;
                                                            }
                                                        }
                                                        if (errors.length) {
                                                            console.log(pgm + 'error. old and new session info are NOT identical') ;
                                                            console.log(pgm + 'old_session_info = ' + JSON.stringify(old_session_info)) ;
                                                            console.log(pgm + 'new_session_info = ' + JSON.stringify(new_session_info)) ;

                                                            errors.unshift('Inconsistency session information') ;
                                                            errors.unshift('Start money transaction failed') ;
                                                            console.log(pgm + 'error: ' + errors.join('. ')) ;
                                                            // notification in w2
                                                            z_wrapper_notification(['error', errors.join('<br>')]) ;
                                                            // notification in mn
                                                            group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;
                                                            pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 2/' + group_debug_seq + ': ';
                                                            console.log(pgm + 'Using group_debug_seq ' + group_debug_seq + ' for this send notification operation');
                                                            request2 = {
                                                                msgtype: 'notification',
                                                                type: 'error',
                                                                message: errors.join('<br>')
                                                            } ;
                                                            console.log(pgm + 'request2 = ' + JSON.stringify(request2)) ;
                                                            encrypt2.send_message(request2, {response: 30000, group_debug_seq: group_debug_seq}, function (response2) {
                                                                pgm = service + '.process_incoming_message.' + request.msgtype + ' send_message callback 3/' + group_debug_seq + ': ';
                                                                console.log(pgm + 'response2 = ' + JSON.stringify(response2)) ;
                                                            }) ;
                                                            return ;
                                                        }
                                                        // only minor differences. continue with start_mt processing
                                                        console.log(pgm + 'warning. minor differences between old and new session info') ;
                                                        console.log(pgm + 'old_session_info = ' + JSON.stringify(old_session_info)) ;
                                                        console.log(pgm + 'new_session_info = ' + JSON.stringify(new_session_info)) ;
                                                    }
                                                    if (!old_session_info.files) old_session_info.files = {} ;
                                                }
                                                session_info = old_session_info || new_session_info ;
                                                reason = request.msgtype ;

                                                // after approve incoming money transaction(s)
                                                // post start_mt tasks:
                                                // 1: warning if ZeroNet port is closed. optional files are not distributed. maybe use small normal files as a backup?
                                                // 2&3: generate public/private keys to be used in wallet-wallet communication
                                                // 4: create wallet-wallet session. expects incoming pubkeys message
                                                // 5: save pubkeys message for other wallet session
                                                // 6: save transaction in ls
                                                // 7: publish so that other MN and W2 sessions can see the new optional files

                                                // create callback chain step 1-7

                                                // start_mt step 7: publish
                                                step_7_publish = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_7_publish/' + group_debug_seq + ': ';
                                                    console.log(pgm + 'publish pubkeys message for other wallet session. publishing via MN publish queue. max one publish once every 30 seconds');
                                                    z_publish({publish: true, reason: reason, group_debug_seq: group_debug_seq});
                                                }; // step_7_publish

                                                // start_mt step 6. save session and money transaction(s) in ls
                                                step_6_save_in_ls = function () { // xxx
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_6_save_in_ls/' + group_debug_seq + ': ';
                                                    var auth_address;
                                                    // remove this session public keys
                                                    delete session_info.pubkey;
                                                    delete session_info.pubkey2;
                                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                        try {
                                                            console.log(pgm + 'OK. Saved wallet-wallet session information in localStorage');
                                                            step_7_publish();
                                                        }
                                                        catch (e) { return send_exception(pgm, e) }
                                                    });
                                                }; // step_6_save_in_ls

                                                // start_mt step 5. pubkeys message for other wallet session
                                                step_5_save_pubkeys_msg = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_5_save_pubkeys_msg/' + group_debug_seq + ': ';
                                                    var request2, error, optional, options;
                                                    request2 = {
                                                        msgtype: 'w2_pubkeys',
                                                        pubkey: session_info.pubkey, // for JSEncrypt
                                                        pubkey2: session_info.pubkey2 // for cryptMessage
                                                    };
                                                    console.log(pgm + 'request2 = ' + JSON.stringify(request2));
                                                    options = {
                                                        encryptions: [3],
                                                        optional: session_info.ip_external ? 'o' : null,
                                                        subsystem: 'w2',
                                                        files: session_info.files,
                                                        status: '1: pubkeys sent, waiting for pubkeys',
                                                        group_debug_seq: group_debug_seq
                                                    } ;
                                                    encrypt4.send_message(request2, options, function (response2, request_filename) {
                                                        try {
                                                            var error;
                                                            if (!response2 || response2.error) {
                                                                error = ['Money transaction post processing failed', 'pubkeys message was not send', 'error = ' + JSON.stringify(response2)];
                                                                report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                                return;
                                                            }
                                                            console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                            console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                            console.log(pgm + 'sent pubkeys message to other wallet session');
                                                            if (!ls.w_files) ls.w_files = {} ;
                                                            ls.w_files[request_filename] = true ;
                                                            reason = request_filename ;
                                                            // mark pubkeys message as sent. do not send two pubkeys messages to other wallet session
                                                            session_info.pubkeys_sent_at = new Date().getTime() ;
                                                            session_info.this_status = options.status ;
                                                            step_6_save_in_ls();
                                                        }
                                                        catch (e) { return send_exception(pgm, e) }
                                                    }); // encrypt_json callback
                                                }; // step_5_save_pubkeys_msg

                                                // start_mt step 4. create wallet session. expects incoming pubkeys message from other wallet session
                                                step_4_create_session = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_4_create_session/' + group_debug_seq + ': ';

                                                    // create new session. demon process should read offline pubkeys message from other wallet session
                                                    encrypt4 = new MoneyNetworkAPI({
                                                        debug: 'encrypt4',
                                                        sessionid: session_info.money_transactionid,
                                                        sender: false,
                                                        prvkey: session_info.prvkey,
                                                        userid2: session_info.userid2,
                                                        cb: process_incoming_message
                                                    });
                                                    console.log(pgm + 'created wallet-wallet session. expects incoming pubkeys message from other wallet session in a few seconds');
                                                    // MoneyNetworkAPI.js:309 MoneyNetworkAPILib.add_session: monitoring other_session_filename e1af7946c6, sessionid = 3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA
                                                    // MoneyNetworkAPI.js:327 MoneyNetworkAPILib.add_session: other_session_filename e1af7946c6 should be processed by encrypt4
                                                    // MoneyNetworkAPI.js:1420 new MoneyNetworkAPI: encrypt4: Encryption setup: waiting for other_session_pubkey, other_session_pubkey2
                                                    step_5_save_pubkeys_msg();
                                                }; // step_4_create_session

                                                // start_mt step 3. generate public/private keys to be used in wallet to wallet communication. cryptMessage. encryption layer 2.
                                                step_3_get_pubkey2 = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_3_get_pubkey2/' + group_debug_seq + ': ';
                                                    var r, debug_seq;
                                                    if (!session_info.hasOwnProperty('userid2')) {
                                                        r = Math.random();
                                                        session_info.userid2 = parseInt(('' + r).substr(2, 3)); // 0-999
                                                        console.log(pgm + 'Generated new cryptMessage pubkey/prvkey set');
                                                    }
                                                    else console.log(pgm + 'Using old cryptMessage pubkey/prvkey set');
                                                    debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'userPublickey', null, group_debug_seq);
                                                    ZeroFrame.cmd("userPublickey", [session_info.userid2], function (pubkey2) {
                                                        try {
                                                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, pubkey2 ? 'OK' : 'Failed. Not found');
                                                            session_info.pubkey2 = pubkey2;
                                                            // console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                                            step_4_create_session();
                                                        }
                                                        catch (e) { return send_exception(pgm, e) }
                                                    }); // userPublickey
                                                }; // step_3_get_pubkey2

                                                // start_mt step 2. generate public/private keys to be used in wallet to wallet communication. JSEncrypt. encryption layer 1.
                                                step_2_get_pubkey = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_2_get_pubkey/' + group_debug_seq + ': ';
                                                    var crypt;
                                                    if (session_info.prvkey) {
                                                        // keep existing JSEncrypt keys
                                                        console.log(pgm + 'Using old JSEncrypt pubkey/prvkey set');
                                                        crypt = new JSEncrypt();
                                                        crypt.setPrivateKey(session_info.prvkey);
                                                    }
                                                    else {
                                                        // generate key JSEncrypt key set
                                                        console.log(pgm + 'Generated new JSEncrypt pubkey/prvkey set');
                                                        crypt = new JSEncrypt({default_key_size: 1024});
                                                        crypt.getKey();
                                                    }
                                                    session_info.pubkey = crypt.getPublicKey();
                                                    session_info.prvkey = crypt.getPrivateKey(); // todo: save prvkey in W2 lS encrypted with ...
                                                    step_3_get_pubkey2();
                                                }; // step_2_get_pubkey

                                                // start_mt step 1. check if zeronet port is open. required for optional files distribution (money transactions)
                                                step_1_check_port = function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_check_port/' + group_debug_seq + ': ';
                                                    check_port(pgm, session_info, group_debug_seq, send_exception, step_2_get_pubkey) ;
                                                }; // step_1_check_port

                                                // start callback chain
                                                step_1_check_port();
                                            }
                                            catch (e) { return send_exception(pgm, e) }
                                        }) ; // read_w_session callback 2
                                    }
                                    catch (e) { return send_exception(pgm, e) }
                                }); // send_response callback 1
                            }
                            catch (e) { return send_exception(pgm, e) }
                        })() ;
                        return;
                        // end start_mt
                    }
                    else if (request.msgtype == 'pubkeys') {
                        // error. pubkeys message from MN should be processes by read_pubkeys function (new session)
                        (function pubkeys() {
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            console.log(pgm + 'Error. request = ' + JSON.stringify(request)) ;
                            console.log(pgm + 'pubkeys message from MN session should be processed by read_pubkeys function after new wallet session with new sessionid') ;
                            console.log(pgm + 'Please check log for errors in read_pubkeys function or wallet startup processing') ;
                            // do not send any response
                            response_timestamp = null ;
                        })() ;
                    }
                    else if (request.msgtype == 'w2_pubkeys') {
                        // w2_pubkeys message handshake between wallet sessions.
                        (function w2_pubkeys(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            var auth_address, sha256, encrypted_session_info, error;
                            try {
                                // load session from ls
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq, ip_external: true}, function (session_info) {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    var request2, i, money_transaction, ls_updated, options ;

                                    try {
                                        if (!session_info) {
                                            error = ['Wallet session handshake failed', 'Money transaction was aborted', 'Unknown sessionid ' + encrypt2.sessionid];
                                            console.log(pgm + 'error. ' + error.join('. '));
                                            z_wrapper_notification(['error', error.join('<br>')]);
                                            // todo: send notification to mn using global encrypt2 object
                                            return; // no error response. this is a offline message
                                        }

                                        // validations:
                                        // - request.pubkey == session_info.pubkey (encryption layer 1)
                                        // - request.pubkey2 == session_info.pubkey2 (layer 2)
                                        // - encrypt2.sessionid == session_info.money_transactionid (layer 3)

                                        // encryption layer 1 (JSEncrypt)
                                        if (!session_info.pubkey) {
                                            session_info.pubkey = request.pubkey;
                                            encrypt2.setup_encryption({pubkey: request.pubkey});
                                            ls_updated = true ;
                                        }
                                        else if (request.pubkey != session_info.pubkey) {
                                            console.log(pgm + 'warning. received a new changed pubkey from other wallet session (JSEncrypt)');
                                            report_error(pgm, ['warning', 'received a changed pubkey'], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'info'});
                                            console.log(pgm + 'old pubkey = ' + session_info.pubkey);
                                            console.log(pgm + 'new pubkey = ' + request.pubkey);
                                        }
                                        // layer 2
                                        if (!session_info.pubkey2) {
                                            session_info.pubkey2 = request.pubkey2;
                                            encrypt2.setup_encryption({pubkey2: request.pubkey2});
                                            ls_updated = true ;
                                        }
                                        else if (request.pubkey2 != session_info.pubkey2) {
                                            console.log(pgm + 'warning. received a new changed pubkey2 from other wallet session (cryptMessage)');
                                            report_error(pgm, ['warning', 'received a changed pubkey2'], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'info'});
                                            console.log(pgm + 'old pubkey2 = ' + session_info.pubkey2);
                                            console.log(pgm + 'new pubkey2 = ' + request.pubkey2);
                                        }
                                        // layer 3
                                        if (encrypt2.sessionid != session_info.money_transactionid) {
                                            console.log(pgm + 'warning. encrypt2.sessionid <> money_transactionid');
                                            report_error(pgm, ['error', 'encrypt2.sessionid <> money_transactionid'], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'error'});
                                            console.log(pgm + 'encrypt2.sessionid = ' + encrypt2.sessionid);
                                            console.log(pgm + 'session_info.money_transactionid = ' + session_info.money_transactionid);
                                        }

                                        // ready for transaction verification. both wallet sessions should have identical money transaction(s)
                                        console.log(pgm + 'session_info.money_transactions = ' + JSON.stringify(session_info.money_transactions));
                                        console.log(pgm + 'sender/receiver check. sender = ' + encrypt2.sender + ', receiver = ' + encrypt2.receiver);

                                        // sender=sweden, receiver=torando
                                        // sweden would like to send money to torando and is asking torando for approval and a bitcoin address
                                        // torando has received money transaction, approved transaction and added a address.
                                        // sweden has not yet received address from torando.
                                        // otherwise the transaction is identical in sweden and torando wallets
                                        // generic sender: only one bitcoin address. either address or return_address
                                        // generic receiver: always two bitcoin addreses. both address and return_address.
                                        // receiver must return bitcoin addresses to sender.
                                        //
                                        // sender_sweden = [{
                                        //    "action": "Send",
                                        //    "code": "tBTC",
                                        //    "amount": 0.0001,
                                        //    "json": {"return_address": "2NG8wLQf5uYiGn8RX4NYPz6HRssenNvVdSj"}
                                        //}];
                                        // receiver_torando = [{
                                        //    "action": "Send",
                                        //    "code": "tBTC",
                                        //    "amount": 0.0001,
                                        //    "json": {
                                        //        "return_address": "2NG8wLQf5uYiGn8RX4NYPz6HRssenNvVdSj",
                                        //        "address": "2MznAqaYAd4ZKXbrLcyRwfUm1HezaPBUXsU"
                                        //    }
                                        //}];
                                        if (ls_updated) console.log(pgm + 'session_info = ' + JSON.stringify(session_info)) ;

                                        if (encrypt2.sender) {
                                            // stop. is sender of money transaction(s).
                                            // wait for receiver of money transaction(s) to send w2_check_mt message with missing bitcoin addresses
                                            console.log(pgm + 'pubkeys message ok. wallet-wallet communication started. is sender of money transaction. waiting for w2_check_mt message from other wallet to crosscheck money transaction(s) before sending money transaction(s) to external API (btc.com)');
                                            if (ls_updated) {
                                                save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                                }) ;
                                            }
                                            else MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return;
                                        }
                                        if (session_info.w2_check_mt_sent_at) {
                                            // ignore. w2_check_mt message has already been sent to other wallet session
                                            if (ls_updated) {
                                                save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                                }) ;
                                            }
                                            else MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return ;
                                        }
                                        console.log(pgm + 'pubkeys message ok. wallet-wallet communication started. is client/receiver. sending w2_check_mt message to other wallet to crosscheck money transaction(s) before sending money transaction(s) to external API (btc.com)');

                                        // is receiver. have both address and return_address for money transaction(s).
                                        // send bitcoin address(es) added in check_mt to sender of money transaction
                                        // w2_check_mt message is being used for money transaction crosscheck
                                        // the two wallets must agree about money transaction(s) to start
                                        request2 = {
                                            msgtype: 'w2_check_mt',
                                            money_transactions: []
                                        };
                                        for (i = 0; i < session_info.money_transactions.length; i++) {
                                            money_transaction = session_info.money_transactions[i];
                                            request2.money_transactions.push({
                                                action: money_transaction.action,
                                                code: money_transaction.code,
                                                amount: money_transaction.amount,
                                                json: {
                                                    address: money_transaction.json.address,
                                                    return_address: money_transaction.json.return_address
                                                }
                                            });
                                        }
                                        console.log(pgm + 'request2 = ' + JSON.stringify(request2));
                                        //request2 = {
                                        //    "msgtype": "addresses",
                                        //    "jsons": [{"address": "2MwdBoKJGVto96ptKRaPbUG6hmpjwuGUCa4"}]
                                        //};
                                        // send w2_check_mt as an offline message to other wallet session
                                        if (!session_info.files) session_info.files = {} ;
                                        options = {
                                            optional: session_info.ip_external ? 'o' : null,
                                            subsystem: 'w2',
                                            files: session_info.files,
                                            status: '2: w2_check_mt sent, waiting for w2_start_mt',
                                            group_debug_seq: group_debug_seq
                                        } ;
                                        encrypt2.send_message(request2, options, function (response2, request_filename) {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' send_message callback 2/' + group_debug_seq + ': ';
                                            var error;
                                            try {
                                                if (!response2 || response2.error) {
                                                    error = ['Money transaction post processing failed', 'w2_check_mt message was not send', 'error = ' + JSON.stringify(response2)];
                                                    report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                    return;
                                                }
                                                console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                if (!ls.w_files) ls.w_files = {} ;
                                                ls.w_files[request_filename] = true ;
                                                // mark as sent. do not sent w2_check_mt message again
                                                session_info.w2_check_mt_sent_at = new Date().getTime() ;
                                                session_info.this_status = options.status ;
                                                save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' save_w_session callback 3/' + group_debug_seq + ': ';
                                                    try { z_publish({publish: true, reason: request_filename});}
                                                    catch (e) {
                                                        // receive offline message pubkeys failed.
                                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                                        console.log(pgm + e.message);
                                                        console.log(e.stack);
                                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                        throw(e);
                                                    }
                                                });
                                            }
                                            catch (e) {
                                                // receive offline message pubkeys failed.
                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                throw(e);
                                            }
                                        }); // send_message callback 2
                                    }
                                    catch (e) {
                                        // receive offline message pubkeys failed.
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                        throw(e);
                                    }
                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive offline message pubkeys failed.
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return; // no response to offline pubkeys message
                        // pubkeys
                    }
                    else if (request.msgtype == 'w2_check_mt') {
                        // after pubkeys session handshake. Now running full encryption
                        // receiver to sender:
                        // - returning missing bitcoin addresses (address or return_address) to money transaction sender
                        //
                        (function w2_check_mt(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            var auth_address, sha256, encrypted_session_info;
                            try {
                                // check ls status
                                if (!ls.w_sessions) ls.w_sessions = {};
                                auth_address = ZeroFrame.site_info.auth_address;
                                if (!ls.w_sessions[auth_address]) ls.w_sessions[auth_address] = {};
                                sha256 = CryptoJS.SHA256(encrypt2.sessionid).toString();
                                encrypted_session_info = ls.w_sessions[auth_address][sha256];
                                if (!encrypted_session_info) {
                                    error = ['Money transaction cannot start', 'w2_check_mt message with unknown sessionid', encrypt2.sessionid];
                                    report_error(pgm, error) ;
                                    return; // no error response. this is a offline message
                                }

                                // load session info from ls
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq, ip_external: true}, function (session_info) {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    var error, i, my_money_transaction, contact_money_transaction, send_w2_start_mt, delete_pubkeys_msg;
                                    try {
                                        console.log(pgm + 'session_info = ' + JSON.stringify(session_info));

                                        // 1) must be sender
                                        if (!session_info.sender) {
                                            console.log(pgm + 'warning. is receiver of money transaction. ignoring incoming w2_check_mt message. w2_check_mt message is only sent from receiver of money transaction to sender of money transaction');
                                            return;
                                        }
                                        // i am sender of money transaction to contact

                                        if (session_info.w2_start_mt_sent_at) {
                                            console.log(pgm + 'stopping. w2_start_mt message has already been sent to other session. w2_start_mt_sent_at = ' + session_info.w2_start_mt_sent_at) ;
                                            return ;
                                        }

                                        // has pubkeys from other wallet been received from other wallet? cannot encrypt w2_start_mt without public keys from other wallet session
                                        if (!encrypt2.other_session_pubkey || !encrypt2.other_session_pubkey2) {
                                            console.log(pgm + 'waiting for pubkeys message from other wallet session. cannot encrypt send w2_start_mt message without public keys') ;
                                            wait_for_pubkeys_message({
                                                encrypt2: encrypt2,
                                                session_info: session_info,
                                                in_filename: filename,
                                                in_msg_name:'w2_check_mt',
                                                out_msg_name: 'w2_start_mt',
                                                group_debug_seq: group_debug_seq
                                            }) ;
                                            return ;
                                        }

                                        // cleanup old outgoing files:
                                        // - is "sender"
                                        // - is receiving w2_check_mt message from "receiver"
                                        // - "receiver" must have received 'w2_pubkeys' message from "sender"
                                        // - find and delete old pubkeys message from sender to receiver
                                        delete_pubkeys_msg = function (cb) {
                                            delete_old_msg({session_info: session_info, msg_name: 'w2_pubkeys', encrypt: encrypt2, group_debug_seq: group_debug_seq}, cb) ;
                                        } ; // delete_pubkeys_msg

                                        delete_pubkeys_msg(function() {
                                            var send_w2_start_mt ;
                                            try {
                                                send_w2_start_mt = function (error, cb) {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_w2_start_mt/' + group_debug_seq + ': ';
                                                    var request2, money_transaction, is_null, options;
                                                    if (error && (typeof error != 'string')) {
                                                        console.log(pgm + 'invalid send_w2_start_mt call. First parameter error must be null or a string') ;
                                                        throw pgm + 'invalid send_w2_start_mt call. First parameter error must be null or a string';
                                                    }
                                                    if (!cb) cb = function () {};
                                                    if (typeof cb != 'function') {
                                                        console.log(pgm + 'invalid send_w2_start_mt call. second parameter cb must be null or a callback function') ;
                                                        throw pgm + 'invalid send_w2_start_mt call. second parameter cb must be null or a callback function';
                                                    }
                                                    request2 = {
                                                        msgtype: 'w2_start_mt',
                                                        pay_results: []
                                                    };
                                                    for (i=0 ; i<session_info.money_transactions.length ; i++) {
                                                        money_transaction = session_info.money_transactions[i] ;
                                                        request2.pay_results.push(money_transaction.btc_send_ok || money_transaction.btc_send_error) ;
                                                        if (request2.pay_results[request2.pay_results.length-1]) is_null = false ;
                                                    } // for i
                                                    if (error && is_null) delete request2.pay_results ;
                                                    if (error) request2.error = error;
                                                    //request2 = {
                                                    //    "msgtype": "w2_start_mt",
                                                    //    "pay_results": ["3b49bae7e2b69f17f35c849f7148cd5c4573dc4ec0a25c3d539eca695cee9061", null]
                                                    //};
                                                    if (!session_info.files) session_info.files = {} ;
                                                    options = {
                                                        optional: session_info.ip_external ? 'o' : null, // use offline optional file (-o) or normal file
                                                        subsystem: 'w2',
                                                        files: session_info.files,
                                                        status: '3: w2_start_mt sent, waiting for w2_end_mt',
                                                        group_debug_seq: group_debug_seq
                                                    } ;
                                                    encrypt2.send_message(request2, options, function (response2, request_filename) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_w2_start_mt send_message callback/' + group_debug_seq + ': ';
                                                        if (!response2 || response2.error) {
                                                            error = ['Money transaction post processing failed', 'w2_start_mt message was not send', 'error = ' + JSON.stringify(response2)];
                                                            report_error(pgm, error, {group_debug_seq: group_debug_seq});
                                                            return cb(error.join('. '));
                                                        }
                                                        console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                        console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                        if (!ls.w_files) ls.w_files = {} ;
                                                        ls.w_files[request_filename] = true ;
                                                        // mark w2_start_mt message as sent. do not sent again
                                                        session_info.w2_start_mt_sent_at = new Date().getTime() ;
                                                        session_info.this_status = options.status ;
                                                        save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                            z_publish({publish: true, reason: request_filename});
                                                            cb(null);
                                                        }) ;
                                                    }); // send_message callback

                                                }; // send_w2_start_mt

                                                // 2) compare jsons in incoming request with money transactions in ls
                                                // should be 100% identical except added address or return address (added by money transaction receiver)
                                                // check number of money transactions
                                                if (request.money_transactions.length != session_info.money_transactions.length) {
                                                    error = [
                                                        'Money transaction cannot start',
                                                        'Different number of rows',
                                                        session_info.money_transactions.length + ' row' + (session_info.money_transactions.length > 1 ? 's' : '') + ' in your transaction',
                                                        request.money_transactions.length + ' row' + (request.money_transactions.length > 1 ? 's' : '') + ' in contact transaction'
                                                    ];
                                                    report_error(pgm, error, {group_debug_seq: group_debug_seq, end_group_operation: false});
                                                    return send_w2_start_mt(error.join('. '));
                                                }
                                                // compare money transactions one by one
                                                for (i = 0; i < request.money_transactions.length; i++) {
                                                    my_money_transaction = session_info.money_transactions[i];
                                                    contact_money_transaction = request.money_transactions[i];
                                                    error = [];
                                                    if (my_money_transaction.action != contact_money_transaction.action) {
                                                        error.push('your action is ' + my_money_transaction.action);
                                                        error.push('contact action is ' + my_money_transaction.action);
                                                    }
                                                    if (my_money_transaction.code != contact_money_transaction.code) {
                                                        error.push('your code is ' + my_money_transaction.code);
                                                        error.push('contact code is ' + contact_money_transaction.code);
                                                    }
                                                    if (my_money_transaction.amount != contact_money_transaction.amount) {
                                                        error.push('your amount is ' + my_money_transaction.amount);
                                                        error.push('contact amount is ' + contact_money_transaction.amount);
                                                    }

                                                    if (my_money_transaction.json.address) {
                                                        if (my_money_transaction.json.address != contact_money_transaction.json.address) {
                                                            error.push('your address is ' + my_money_transaction.json.address);
                                                            error.push('contact address is ' + contact_money_transaction.json.address);
                                                        }
                                                    }
                                                    else {
                                                        // add missing address from incoming w2_check_mt message
                                                        my_money_transaction.json.address = contact_money_transaction.json.address;
                                                    }

                                                    if (my_money_transaction.json.return_address) {
                                                        if (my_money_transaction.json.return_address != contact_money_transaction.json.return_address) {
                                                            error.push('your return_address is ' + my_money_transaction.json.return_address);
                                                            error.push('contact return_address is ' + contact_money_transaction.json.return_address);
                                                        }
                                                    }
                                                    else {
                                                        // add missing return_address from incoming w2_check_mt message
                                                        my_money_transaction.json.return_address = contact_money_transaction.json.return_address;
                                                    }

                                                    if (error.length) {
                                                        error.unshift('Difference' + (error.length / 2 > 1 ? 's' : '') + ' in row ' + (i + 1));
                                                        error.unshift('Money transaction cannot start');
                                                        report_error(pgm, error, {group_debug_seq: group_debug_seq, end_group_operation: false});
                                                        return send_w2_start_mt(error.join('. '));
                                                    }
                                                } // for i (money_transactions)

                                                // money transaction in both wallets are 100% identical.
                                                console.log(pgm + 'OK w2_check_mt message. all addresses ready. ready to execute transaction(s)');

                                                // encrypt and save changed session info
                                                console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                                save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                    // encrypt1.encrypt_json(session_info, {encryptions: [2], group_debug_seq: group_debug_seq}, function (encrypted_session_info) {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' save_w_session callback 2/' + group_debug_seq + ': ';
                                                    var send_money, ls_updated, wallet_was_open, optional_open_wallet, optional_close_wallet;
                                                    try {

                                                        if (error.length) {
                                                            // stop. error has already been handled in send_w2_start_mt
                                                            console.log(pgm + error.join('. '));
                                                            return;
                                                        }
                                                        // 2) call btc.com api
                                                        console.log(pgm + 'call relevant btc.com api commands (send money, get transaction)');
                                                        console.log(pgm + 'keep track of transaction status in ls');
                                                        console.log(pgm + 'todo: must update file with transaction status');
                                                        console.log(pgm + 'send w2_start_mt message to other wallet');

                                                        // open wallet before any send_money calls
                                                        wallet_was_open = (wallet_info.status == 'Open');
                                                        optional_open_wallet = function (cb) {
                                                            var is_wallet_required, i, money_transaction, error;
                                                            if (wallet_was_open) return cb();
                                                            // is wallet required in send_money loop?
                                                            is_wallet_required = false;
                                                            for (i = 0; i < session_info.money_transactions.length; i++) {
                                                                money_transaction = session_info.money_transactions[i];
                                                                if ((money_transaction.action == 'Send') && (money_transaction.code == 'tBTC')) is_wallet_required = true;
                                                            }
                                                            if (!is_wallet_required) return cb(); // nothing to send
                                                            // wallet log in is required
                                                            if (!status.wallet_id || !status.wallet_password) {
                                                                error = ['Money transaction failed', 'Cannot send money', 'No wallet log in was found'];
                                                                console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                                                console.log(pgm + 'todo: update file with money transaction status');
                                                                return report_error(pgm, error, {group_debug_seq: group_debug_seq});
                                                            }
                                                            // open wallet
                                                            btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                                                try {
                                                                    if (error && (wallet_info.status != 'Open')) {
                                                                        if (error.match(/Access-Control-Allow-Origin/)) return btc_cross_domain_error('Cannot open wallet', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                                        error = ['Money transaction failed', 'Cannot send money', 'Open wallet request failed', error];
                                                                        console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                                                        console.log(pgm + 'todo: update file with money transaction status');
                                                                        return report_error(pgm, error, {group_debug_seq: group_debug_seq});
                                                                    }
                                                                    // continue with send_money operations
                                                                    cb();
                                                                }
                                                                catch (e) {
                                                                    error = ['Money transaction failed', 'Cannot send money', 'Open wallet request failed', e.message];
                                                                    console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                                                    console.log(pgm + 'todo: update file with money transaction status');
                                                                    return report_error(pgm, error, {group_debug_seq: group_debug_seq});
                                                                }
                                                            }); // init_wallet callback

                                                        }; // optional_open_wallet

                                                        optional_close_wallet = function (cb) {
                                                            if (wallet_was_open) return cb();
                                                            if (wallet_info.status != 'Open') return cb();
                                                            // close wallet
                                                            btcService.close_wallet(function (res) {
                                                                console.log(pgm + 'res = ' + JSON.stringify(res));
                                                                cb();
                                                            });
                                                        }; // optional_close_wallet


                                                        optional_open_wallet(function () {
                                                            var send_money;

                                                            // send money loop (if any Send money transactions in money_transactions array)
                                                            ls_updated = false;
                                                            send_money = function (i) {
                                                                var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_money/' + group_debug_seq + ': ';
                                                                var money_transaction, amount_bitcoin, amount_satoshi;
                                                                if (i >= session_info.money_transactions.length) {
                                                                    console.log(pgm + 'done sending money. ');
                                                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                                        console.log(pgm + 'saved session_info in ls');
                                                                        optional_close_wallet(function () {
                                                                            send_w2_start_mt(null, function () {
                                                                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq);
                                                                            });
                                                                        });
                                                                    });
                                                                    //encrypt1.encrypt_json(session_info, {encryptions: [2], group_debug_seq: group_debug_seq}, function (encrypted_session_info) {
                                                                    //    var pgm = service + '.process_incoming_message.' + request.msgtype + ' encrypt json callback 3/' + group_debug_seq + ': ';
                                                                    //    var sha256;
                                                                    //    sha256 = CryptoJS.SHA256(session_info.money_transactionid).toString();
                                                                    //    ls.w_sessions[auth_address][sha256] = encrypted_session_info;
                                                                    //    console.log(pgm + 'session_info.money_transactionid = ' + session_info.money_transactionid + ', sha256 = ' + sha256);
                                                                    //    ls_save() ;
                                                                    //})
                                                                    return;
                                                                }
                                                                money_transaction = session_info.money_transactions[i];
                                                                if (money_transaction.action != 'Send') return send_money(i + 1); // Receive money. must be started by contact wallet
                                                                if (money_transaction.code != 'tBTC') return send_money(i + 1); // not test Bitcoins
                                                                amount_bitcoin = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount);
                                                                amount_satoshi = '' + Math.round(amount_bitcoin * one_hundred_millions);
                                                                if (money_transaction.btc_send_at) {
                                                                    console.log(pgm + 'money transaction has already been sent to btc. money_transaction = ' + JSON.stringify(money_transaction));
                                                                    return send_money(i + 1);
                                                                }
                                                                money_transaction.btc_send_at = new Date().getTime();
                                                                // wallet to wallet communication. send money operation has already been confirmed in UI. confirm = false
                                                                btcService.send_money(money_transaction.json.address, amount_satoshi, false, function (err, result) {
                                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_money send_money callback/' + group_debug_seq + ': ';
                                                                    var amount_btc, amount_satoshi ;
                                                                    try {
                                                                        if (err) {
                                                                            if ((typeof err == 'object') && err.message) err = err.message;
                                                                            money_transaction.btc_send_error = err;
                                                                            if (err.match(/Access-Control-Allow-Origin/)) return btc_cross_domain_error('Cannot send money', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                                            // report_error(pgm, ["Money was not sent", err], {group_debug_seq: group_debug_seq, end_group_operation: false});
                                                                            report_error(pgm, ["Money was not sent", err]); // new group_debug_seq for notification
                                                                            console.log(pgm + 'todo: retry, abort or ?')
                                                                        }
                                                                        else {
                                                                            money_transaction.btc_send_ok = result;
                                                                            amount_btc = amount_bitcoin.toFixed(8) ;
                                                                            amount_satoshi = Math.round(amount_bitcoin * one_hundred_millions) ;
                                                                            // report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was sent to ' + session_info.contact.alias], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'done'}) ;
                                                                            report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was sent to ' + session_info.contact.alias], {type: 'done'}) ; // new group_debug_seq for notification
                                                                        }
                                                                        console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction));
                                                                        //money_transaction = {
                                                                        //    "action": "Send",
                                                                        //    "code": "tBTC",
                                                                        //    "amount": 0.0001,
                                                                        //    "json": {
                                                                        //        "return_address": "2NF2iSCvKEip3uJtQ6Sg7EjmxPHGvidJeAx",
                                                                        //        "address": "2ND1A9k3mkAgfUqvdTddV5R8doD92578FLh"
                                                                        //    },
                                                                        //    "btc_send_at": 1510850263171,
                                                                        //    "btc_send_ok": "b0d27ba12287fc9433560accf19e13aabae575d577f952fd1670ee32ab133ccc"
                                                                        //};

                                                                        ls_updated = true;
                                                                        // next money transaction
                                                                        send_money(i + 1);

                                                                    }
                                                                    catch (e) {
                                                                        // receive offline message w2_check_mt failed.
                                                                        if (!e) return; // exception in MoneyNetworkAPI instance
                                                                        console.log(pgm + e.message);
                                                                        console.log(e.stack);
                                                                        report_error(pgm, ["JS exception", e.message], {log: false});
                                                                        throw(e);
                                                                    }

                                                                });
                                                            };
                                                            send_money(0);

                                                        }); // optional_open_wallet callback 4

                                                    }
                                                    catch (e) {
                                                        // receive offline message w2_check_mt failed.
                                                        if (!e) return; // exception in MoneyNetworkAPI instance
                                                        console.log(pgm + e.message);
                                                        console.log(e.stack);
                                                        report_error(pgm, ["JS exception", e.message], {log: false});
                                                        throw(e);
                                                    }
                                                }); // save_w_session callback 3

                                            }
                                            catch (e) {
                                                // receive offline message w2_check_mt failed.
                                                if (!e) return; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false});
                                                throw(e);
                                            }
                                        }) ; // delete_pubkeys_msg callback 2

                                    }
                                    catch (e) {
                                        // receive offline message w2_check_mt failed.
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false}) ;
                                        throw(e);
                                    }
                                }); // read_w_session callback 1

                            }
                            catch (e) {
                                // receive offline message w2_check_mt failed.
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false}) ;
                                throw(e);
                            }
                        })() ;
                        return; // no response to offline w2_check_mt message
                        // w2_check_mt
                    }
                    else if (request.msgtype == 'w2_start_mt') {
                        // sender to receiver: after w2_check_mt message. start or abort money transaction(s)
                        // request = {"msgtype":"w2_start_mt"}
                        (function w2_start_mt(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            try {
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq, ip_external: true}, function (session_info)  {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    try {
                                        var wallet_was_open, optional_open_wallet, optional_close_wallet, send_w2_end_mt,
                                            error, i, money_transaction, no_pay_ok, no_pay_error, delete_old_messages ;

                                        console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                        if (!session_info) {
                                            error = ['Money transaction cannot start', 'w2_check_mt message with unknown sessionid', encrypt2.sessionid];
                                            return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                        }

                                        if (session_info.w2_start_mt_received_at) {
                                            // ignore. already received. must be a wallet page load. see load_w_sessions
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return ;
                                        }

                                        // 1) must be receiver
                                        if (session_info.sender) {
                                            console.log(pgm + 'warning. is sender of money transaction. ignoring incoming w2_start_mt message. only sent from sender of money transaction to client/receiver of money transaction');
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return;
                                        }

                                        // cleanup old outgoing files:
                                        // - is "receiver"
                                        // - is receiving w2_start_mt message from "sender"
                                        // - "sender" must have received 'w2_pubkeys' and "w2_check_mt" messages from "receiver"
                                        // - find and delete old pubkeys and w2_check_mt messages from receiver to sender
                                        delete_old_messages = function (cb) {
                                            delete_old_msg({session_info: session_info, msg_name: 'w2_pubkeys', encrypt: encrypt2, group_debug_seq: group_debug_seq}, function() {
                                                delete_old_msg({session_info: session_info, msg_name: 'w2_check_mt', encrypt: encrypt2, group_debug_seq: group_debug_seq}, cb) ;
                                            }) ;
                                        } ; // delete_w2_check_mt_msg

                                        if (request.error) {
                                            // w2_check_mt check failed. money transaction was aborted by sender of money transaction
                                            console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                            console.log(pgm + 'todo: update file with money transaction status');
                                            delete_old_messages(function() {
                                                report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                            }) ;
                                            return ;
                                        }

                                        // has pubkeys from other wallet been received from other wallet? cannot encrypt w2_end_mt without public keys from other wallet session
                                        if (!encrypt2.other_session_pubkey || !encrypt2.other_session_pubkey2) {
                                            console.log(pgm + 'waiting for pubkeys message from other wallet session. cannot encrypt send w2_end_mt message without public keys') ;
                                            wait_for_pubkeys_message({
                                                encrypt2: encrypt2,
                                                session_info: session_info,
                                                in_filename: filename,
                                                in_msg_name:'w2_start_mt',
                                                out_msg_name: 'w2_end_mt',
                                                group_debug_seq: group_debug_seq
                                            }) ;
                                            return ;
                                        }

                                        delete_old_messages(function() {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' delete_w2_check_mt_msg callback 2/' + group_debug_seq + ': ';
                                            var send_w2_end_mt ;
                                            try {
                                                // receiver to sender: send w2_end_mt to sender of money transaction. error: w2_start_mt validation error, cb: next step
                                                send_w2_end_mt = function (error, cb) {
                                                    var request2, i, money_transaction, optional, options ;
                                                    if (error && (typeof error != 'string')) {
                                                        error = 'invalid send_w2_end_mt call. First parameter error must be null or a string' ;
                                                        console.log(pgm + error) ;
                                                        throw pgm + error;
                                                    }
                                                    if (!cb) cb = function () {};
                                                    if (typeof cb != 'function') {
                                                        error = 'invalid send_w2_end_mt call. second parameter cb must be null or a callback function' ;
                                                        console.log(pgm + error) ;
                                                        throw pgm + error;
                                                    }
                                                    request2 = {
                                                        msgtype: 'w2_end_mt',
                                                        pay_results: []
                                                    } ;
                                                    if (error) request2.error = error ;
                                                    for (i=0 ; i<session_info.money_transactions.length ; i++) {
                                                        money_transaction = session_info.money_transactions[i] ;
                                                        request2.pay_results.push(money_transaction.btc_send_ok || money_transaction.btc_send_error) ;
                                                    }
                                                    if (!session_info.files) session_info.files = {} ;
                                                    options = {
                                                        optional: session_info.ip_external ? 'o' : null, // use offline optional file (-o) or normal file
                                                        subsystem: 'w2',
                                                        files: session_info.files,
                                                        status: '4: w2_end_mt sent, waiting for w2_cleanup_mt',
                                                        group_debug_seq: group_debug_seq
                                                    } ;
                                                    encrypt2.send_message(request2, options, function (response2, request_filename) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_w2_end_mt send_message callback/' + group_debug_seq + ': ';
                                                        if (!response2 || response2.error) {
                                                            error = ['Money transaction stopped', 'w2_end_mt message was not send', 'error = ' + JSON.stringify(response2)];
                                                            save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                                report_error(pgm, error, {group_debug_seq: group_debug_seq}, function() {
                                                                    cb(error.join('. '))
                                                                });
                                                            }) ;
                                                            return ;
                                                        }
                                                        console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                        console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                        if (!ls.w_files) ls.w_files = {} ;
                                                        ls.w_files[request_filename] = true ;
                                                        // mark w2_end_mt message as sent. do not sent again
                                                        session_info.w2_end_mt_sent_at = new Date().getTime() ;
                                                        session_info.this_status = options.status ;
                                                        cleanup_session_info(session_info) ;
                                                        save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                            z_publish({publish: true, reason: request_filename});
                                                            cb(null)
                                                        }) ;
                                                    }); // send_message callback
                                                } ; // send_w2_end_mt

                                                // validate w2_start_mt
                                                // - pay_results.length == money_transactions.length
                                                // - pay_resulls row (is receiver):
                                                //  - null if sender is requesting money,
                                                //  - btc OK (bitcoin transactionid) or error message if receiver is sender of money transaction (request money)
                                                if (request.pay_results.length != session_info.money_transactions.length) {
                                                    // w2_start_mt request is invalid. send w2_end_mt error message
                                                    error = 'Invalid number of pay_results rows. Expected ' + session_info.money_transactions.length + ' rows. Found ' + request.pay_results.length + ' rows' ;
                                                    report_error(pgm, error, {group_debug_seq: group_debug_seq}, function() {
                                                        send_w2_end_mt(error);
                                                    }) ;
                                                    return ;
                                                }
                                                no_pay_ok = 0 ;
                                                no_pay_error = 0 ;
                                                for (i=0 ; i<session_info.money_transactions.length ; i++) {
                                                    money_transaction = session_info.money_transactions[i] ;
                                                    if (money_transaction.action == 'Send') {
                                                        // is receiver. sender is sending money. pay_results must have btc OK or Error result
                                                        if (request.pay_results[i] == null) {
                                                            error = 'Error. pay_results[' + i + '] is missing. Expected bitcoin transaction id or error message' ;
                                                            report_error(pgm, error, {group_debug_seq: group_debug_seq}, function () {
                                                                send_w2_end_mt(error);
                                                            }) ;
                                                            return ;
                                                        }
                                                        else if (request.pay_results[i].match(/[0-9a-f]{64}/)) {
                                                            // could be a bitcoin transaction id but must be validated in next step
                                                            no_pay_ok++ ;
                                                            money_transaction.btc_receive_ok = request.pay_results[i] ;
                                                        }
                                                        else {
                                                            // must be a error message
                                                            no_pay_error++ ;
                                                            money_transaction.btc_receive_error = request.pay_results[i] ;
                                                            report_error(pgm, ['No money was received from ' + session_info.contact.alias, request.pay_results[i]], {group_debug_seq: group_debug_seq, end_group_operation: false}) ;
                                                        }
                                                    }
                                                    else {
                                                        // is receiver. sender is requesting money. pay_results[i] must null
                                                        if (request.pay_results[i] != null) {
                                                            error = 'Error. Expected pay_results[' + i + '] to be null. Found ' + request.pay_results[i] ;
                                                            report_error(pgm, error, {group_debug_seq: group_debug_seq}, function () {
                                                                send_w2_end_mt(error);
                                                            }) ;
                                                            return ;
                                                        }
                                                    }
                                                }

                                                // open wallet before any send_money or get transaction calls
                                                wallet_was_open = (wallet_info.status == 'Open') ;
                                                optional_open_wallet = function (cb) {
                                                    var is_wallet_required, i, money_transaction, error ;
                                                    if (wallet_was_open) return cb() ;
                                                    if (!no_pay_ok) return cb() ; //
                                                    // is wallet required in send_money loop?
                                                    is_wallet_required = false ;
                                                    if (no_pay_ok) is_wallet_required = true ;
                                                    for (i=0 ; i<session_info.money_transactions.length ; i++) {
                                                        money_transaction = session_info.money_transactions[i];
                                                        if ((money_transaction.action == 'Request') && (money_transaction.code == 'tBTC')) is_wallet_required = true ;
                                                    }
                                                    if (!is_wallet_required) return cb() ; // nothing to send and no transaction ids to validate
                                                    // wallet log in is required
                                                    if (!status.wallet_id || !status.wallet_password) {
                                                        error = ['Money transaction failed', 'Cannot open wallet', 'No wallet log in was found'] ;
                                                        console.log(pgm + 'todo: save received transaction in ls (no_pay_ok>0 or no_pay_error>0)');
                                                        console.log(pgm + 'todo: update file with money transaction status');
                                                        // todo: send w2_end_mt (publish required) or report_error first?
                                                        return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                    }
                                                    // open wallet
                                                    btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                                        try {
                                                            if (error && (wallet_info.status != 'Open')) {
                                                                if (error.match(/Access-Control-Allow-Origin/)) return btc_cross_domain_error('Cannot open wallet', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                                error = ['Money transaction failed', 'Open wallet request failed', error] ;
                                                                console.log(pgm + 'todo: save updated money transaction in ls');
                                                                console.log(pgm + 'todo: update file with money transaction status');
                                                                return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                            }
                                                            // continue with send_money and check transaction operations
                                                            cb() ;
                                                        }
                                                        catch (e) {
                                                            error = ['Money transaction failed', 'Open wallet request failed', e.message];
                                                            console.log(pgm + 'todo: save updated money transaction in ls');
                                                            console.log(pgm + 'todo: update file with money transaction status');
                                                            return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                        }
                                                    }); // init_wallet callback

                                                } ; // optional_open_wallet

                                                optional_close_wallet = function (cb) {
                                                    if (wallet_was_open) return cb() ;
                                                    if (wallet_info.status != 'Open') return cb() ;
                                                    // close wallet
                                                    btcService.close_wallet(function (res) {
                                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                        cb() ;
                                                    });
                                                } ; // optional_close_wallet

                                                // start callback sequence (open wallet, send_or_check_money, close wallet)
                                                optional_open_wallet(function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' optional_open_wallet callback 3/' + group_debug_seq + ': ';
                                                    var send_money, check_money, send_or_check_money ;

                                                    send_money = function (i) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_money/' + group_debug_seq + ': ';
                                                        var money_transaction, amount_bitcoin, amount_satoshi ;
                                                        money_transaction = session_info.money_transactions[i];
                                                        // is receiver. action must be Request
                                                        if (money_transaction.action != 'Request') throw pgm + 'invalid call. send_money. Is receiver and action is not Request' ;
                                                        if (money_transaction.btc_send_ok) return send_or_check_money(i + 1); // stop. money has already been sent
                                                        amount_bitcoin = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount);
                                                        amount_satoshi = '' + Math.round(amount_bitcoin * one_hundred_millions);
                                                        money_transaction.btc_send_at = new Date().getTime();
                                                        // wallet to wallet communication. send money operation has already been confirmed in UI. confirm = false
                                                        btcService.send_money(money_transaction.json.address, amount_satoshi, false, function (err, result) {
                                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_money send_money callback/' + group_debug_seq + ': ';
                                                            var amount_btc, amount_satoshi ;
                                                            try {
                                                                if (err) {
                                                                    if ((typeof err == 'object') && err.message) err = err.message;
                                                                    money_transaction.btc_send_error = err;
                                                                    if (err.match(/Access-Control-Allow-Origin/)) return btc_cross_domain_error('Cannot send money', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                                    // report_error(pgm, err,  {group_debug_seq: group_debug_seq, end_group_operation: false}) ;
                                                                    report_error(pgm, err) ; // new group_debug_seq for notification
                                                                    console.log(pgm + 'todo: retry, abort or ?')
                                                                }
                                                                else {
                                                                    money_transaction.btc_send_ok = result;
                                                                    amount_btc = amount_bitcoin.toFixed(8) ;
                                                                    amount_satoshi = Math.round(amount_bitcoin * one_hundred_millions) ;
                                                                    // report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was sent to ' + session_info.contact.alias], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'done'}) ;
                                                                    report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was sent to ' + session_info.contact.alias], {type: 'done'}) ; // new group_debug_seq for notification
                                                                }
                                                                console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction));
                                                                // next money transaction
                                                                send_or_check_money(i + 1);
                                                            }
                                                            catch (e) {
                                                                // receive message w2_start_mt failed.
                                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                                console.log(pgm + e.message);
                                                                console.log(e.stack);
                                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                                throw(e);
                                                            }
                                                        }); // send_money callback

                                                    } ; // send_money

                                                    check_money = function (i) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.check_money/' + group_debug_seq + ': ';
                                                        var money_transaction ;
                                                        money_transaction = session_info.money_transactions[i];
                                                        if (money_transaction.action != 'Send') throw pgm + 'invalid call. Is receiver and action is not Send' ;
                                                        if (!money_transaction.btc_receive_ok) throw pgm + 'invalid call. No txhash received from sender' ;
                                                        btcService.get_transaction(money_transaction.btc_receive_ok, function (err, tx) {
                                                            var amount_bitcoin, expected_amount, received_amount, j, output, amount_btc, amount_satoshi ;
                                                            console.log(pgm + 'err = ' + JSON.stringify(err)) ;
                                                            console.log(pgm + 'tx = ' + JSON.stringify(tx)) ;
                                                            if (err && err.crossDomain) return btc_cross_domain_error('Cannot verify bitcoin transactionid', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                            if (err && err.code == 404) {
                                                                //err = {"code":404}
                                                                //tx = {"code":404,"msg":"Transaction not found"}
                                                                // transactionid format is OK but btc.com transaction lookup failed.
                                                                // could be a distribution issue. try again in <n> seconds. n in 60, 120, 240 seconds
                                                                if (!money_transaction.btc_receive_not_found || money_transaction.btc_receive_not_found < 240) {
                                                                    if (!money_transaction.btc_receive_not_found) money_transaction.btc_receive_not_found = 30 ;
                                                                    console.log(pgm + 'transaction was not found. retry in ' + money_transaction.btc_receive_not_found + ' seconds') ;
                                                                    money_transaction.btc_receive_not_found = money_transaction.btc_receive_not_found * 2 ;
                                                                    setTimeout(restart_receive_message, money_transaction.btc_receive_not_found*1000) ;
                                                                    return ;
                                                                }
                                                            }
                                                            if (err) {
                                                                // get transaction failed. maybe API error. maybe invalid transactionid
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. btc error = ' + err ;
                                                                return send_or_check_money(i + 1);
                                                            }
                                                            // check tx
                                                            if (!tx) {
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. tx is null' ;
                                                                return send_or_check_money(i + 1);
                                                            }
                                                            if (!tx.outputs || !tx.outputs.length) {
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. tx.outputs is empty' ;
                                                                return send_or_check_money(i + 1);
                                                            }
                                                            // check amount
                                                            amount_bitcoin = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount) ;
                                                            expected_amount = Math.round(amount_bitcoin * one_hundred_millions) ;
                                                            received_amount = 0 ;
                                                            for (j=0 ; j<tx.outputs.length ; j++) {
                                                                output = tx.outputs[j] ;
                                                                if (output.address == money_transaction.json.address) received_amount = received_amount + output.value ;
                                                            }
                                                            console.log(pgm + 'expected_amount = ' + expected_amount + ', received_amount = ' + received_amount) ;
                                                            if (Math.round(Math.abs(expected_amount - received_amount)) == 0) {
                                                                console.log(pgm + 'Everything is fine. todo: notification in UI.') ;
                                                                amount_btc = amount_bitcoin.toFixed(8) ;
                                                                amount_satoshi = expected_amount ;
                                                                // report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was received from ' + session_info.contact.alias], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'done'}) ;
                                                                report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was received from ' + session_info.contact.alias], {type: 'done'}) ; // use new group_debug_seq for notification
                                                                return send_or_check_money(i + 1);
                                                            }
                                                            console.log(pgm + 'error: expected amount <> received amount. todo: notification in UI') ;
                                                            money_transaction.btc_receive_error = 'Expected ' + expected_amount + ' satoshi. Received ' + received_amount + ' satoshi' ;
                                                            send_or_check_money(i + 1);
                                                        }) ;
                                                    } ; // check_money

                                                    // send/check money loop (if any Send or check money transactions in money_transactions array)
                                                    send_or_check_money = function (i) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_or_check_money/' + group_debug_seq + ': ';
                                                        var money_transaction;
                                                        if (i >= session_info.money_transactions.length) {
                                                            console.log(pgm + 'done sending and checking money');
                                                            // mark w2_start_mt message as received. do not process again
                                                            session_info.w2_start_mt_received_at = new Date().getTime() ;
                                                            save_w_session(session_info, {group_debug_seq: group_debug_seq}, function () {
                                                                console.log(pgm + 'saved session_info in ls') ;
                                                                optional_close_wallet(function() {
                                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                                                    send_w2_end_mt() ;
                                                                }) ;
                                                            }) ;
                                                            return;
                                                        }
                                                        // is receiver
                                                        money_transaction = session_info.money_transactions[i];
                                                        if (!money_transaction) console.log(pgm + 'error. session_info.money_transactions.length = ' + session_info.money_transactions.length + ', i = ' + i) ;
                                                        if (money_transaction.code != 'tBTC') return send_or_check_money(i + 1); // not test Bitcoins
                                                        if (money_transaction.action == 'Request') return send_money(i) ;
                                                        if (money_transaction.btc_receive_ok) return check_money(i) ;
                                                        send_or_check_money(i+1) ;
                                                    }; // send_or_check_money
                                                    // start send (action=Request) or check (action=Send) money loop
                                                    send_or_check_money(0);

                                                }) ; // optional_open_wallet callback 3

                                            }
                                            catch (e) {
                                                // receive offline message w2_start_mt failed.
                                                // notification in w2 and mn UI
                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                throw(e);
                                            }

                                        }) ; // delete_w2_check_mt_msg callback 2


                                    }
                                    catch (e) {
                                        // receive offline message w2_start_mt failed.
                                        // notification in w2 and mn UI
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                        throw(e);
                                    }

                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive offline message w2_start_mt failed.
                                // notification in w2 and mn UI
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return ; // no OK response to offline w2_start_mt
                        // w2_start_mt
                    }
                    else if (request.msgtype == 'w2_end_mt') {
                        // receiver to sender: after w2_start_mt message. return info about done or failed money transactions
                        //request = {
                        //    "msgtype": "w2_start_mt",
                        //    "pay_results": [null, "91eb16089db248f0102dde22a6c757cfda18a2642f7571b38f9ac159ca3ef449"]
                        //};
                        (function w2_end_mt(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            try {
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq, ip_external: true}, function (session_info)  {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    try {
                                        var wallet_was_open, optional_open_wallet, optional_close_wallet, error, i,
                                            money_transaction, no_pay_ok, no_pay_error, delete_old_w2_start_mt_msg ;

                                        console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                        if (!session_info) {
                                            error = ['Money transaction failed', 'w2_end_mt message with unknown sessionid', encrypt2.sessionid];
                                            return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                        }

                                        if (session_info.w2_end_mt_received_at) {
                                            // ignore. already received. must be a wallet page load. see load_w_sessions
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return ;
                                        }

                                        // 1) must be sender
                                        if (session_info.receiver) {
                                            console.log(pgm + 'warning. is receiver of money transaction. ignoring incoming w2_end_mt message. only sent from receiver of money transaction to sender of money transaction');
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return;
                                        }

                                        // cleanup old outgoing files:
                                        // - is "sender"
                                        // - is receiving w2_end_mt message from "receiver"
                                        // - "sender" must have received "w2_start_mt" message from "sender"
                                        // - find and delete old w2_start_mt message from sender to receiver

                                        delete_old_w2_start_mt_msg = function(cb) {
                                            delete_old_msg({session_info: session_info, msg_name: 'w2_start_mt', encrypt: encrypt2, group_debug_seq: group_debug_seq}, cb) ;
                                        } ;
                                        delete_old_w2_start_mt_msg(function() {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' delete_old_w2_start_mt_msg callback 2/' + group_debug_seq + ': ';
                                            var send_w2_cleanup_mt ;
                                            try {
                                                if (request.error) {
                                                    // w2_start_mt check failed. money transaction was aborted by receiver of money transaction
                                                    console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                                    console.log(pgm + 'todo: update file with money transaction status');
                                                    return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                }


                                                // sender to receiver: send w2_cleanup_mt to sender of money transaction. error: w2_end_mt validation error, cb: next step
                                                send_w2_cleanup_mt = function (error, cb) {
                                                    var request2, options ;
                                                    if (error && (typeof error != 'string')) {
                                                        error = 'invalid send_w2_cleanup_mt call. First parameter error must be null or a string' ;
                                                        console.log(pgm + error) ;
                                                        throw pgm + error;
                                                    }
                                                    if (!cb) cb = function () {};
                                                    if (typeof cb != 'function') {
                                                        error = 'invalid send_w2_cleanup_mt call. second parameter cb must be null or a callback function' ;
                                                        console.log(pgm + error) ;
                                                        throw pgm + error;
                                                    }
                                                    request2 = {
                                                        msgtype: 'w2_cleanup_mt'
                                                    } ;
                                                    if (error) request2.error = error ;

                                                    // message is NOT added to list of files in session_info.files / ls.w_files
                                                    // == cleanup in next wallet page reload
                                                    options = {
                                                        optional: session_info.ip_external ? 'o' : null, // use offline optional file (-o) or normal file
                                                        subsystem: 'w2',
                                                        status: '5: w2_cleanup_mt sent, done',
                                                        group_debug_seq: group_debug_seq
                                                    } ;
                                                    encrypt2.send_message(request2, options, function (response2, request_filename) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.send_w2_end_mt send_message callback/' + group_debug_seq + ': ';
                                                        if (!response2 || response2.error) {
                                                            error = ['Money transaction stopped', 'w2_end_mt message was not send', 'error = ' + JSON.stringify(response2)];
                                                            save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                                report_error(pgm, error, {group_debug_seq: group_debug_seq}, function() {
                                                                    cb(error.join('. '))
                                                                });
                                                            }) ;
                                                            return ;
                                                        }
                                                        console.log(pgm + 'response2        = ' + JSON.stringify(response2));
                                                        console.log(pgm + 'request_filename = ' + JSON.stringify(request_filename));
                                                        // mark w2_cleanup_mt message as sent. do not sent again
                                                        session_info.w2_cleanup_mt_sent_at = new Date().getTime() ;
                                                        session_info.this_status = options.status ;
                                                        cleanup_session_info(session_info) ;
                                                        save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                            z_publish({publish: true, reason: request_filename});
                                                            cb(null)
                                                        }) ;
                                                    }); // send_message callback
                                                } ; // send_w2_cleanup_mt


                                                // validate w2_end_mt message
                                                // - pay_results.length == money_transactions.length
                                                // - pay_results row (is sender):
                                                //  - null if sender is sending money,
                                                //  - btc OK (bitcoin transactionid) or error message if sender is requesting money
                                                if (request.pay_results.length != session_info.money_transactions.length) {
                                                    // w2_start_mt request is invalid. send w2_end_mt error message
                                                    error = 'Invalid number of pay_results rows. Expected ' + session_info.money_transactions.length + ' rows. Found ' + request.pay_results.length + ' rows' ;
                                                    report_error(pgm, error, {group_debug_seq: group_debug_seq}, function() {
                                                        send_w2_cleanup_mt(error) ;
                                                    }) ;
                                                    return ;
                                                }
                                                no_pay_ok = 0 ;
                                                no_pay_error = 0 ;
                                                for (i=0 ; i<session_info.money_transactions.length ; i++) {
                                                    money_transaction = session_info.money_transactions[i] ;
                                                    if (money_transaction.action == 'Request') {
                                                        // is sender. receiver is sending money. pay_results must have btc OK or Error result
                                                        if (request.pay_results[i] == null) {
                                                            error = 'Error. pay_results[' + i + '] is missing. Expected bitcoin transaction id or error message' ;
                                                            report_error(pgm, error, {group_debug_seq: group_debug_seq}, function () {
                                                                send_w2_cleanup_mt(error) ;
                                                            }) ;
                                                            return ;
                                                        }
                                                        else if (request.pay_results[i].match(/[0-9a-f]{64}/)) {
                                                            // could be a bitcoin transaction id but must be validated in next step
                                                            no_pay_ok++ ;
                                                            money_transaction.btc_receive_ok = request.pay_results[i] ;
                                                        }
                                                        else {
                                                            // must be a pay money error message from other session. continue processing anyway
                                                            no_pay_error++ ;
                                                            money_transaction.btc_receive_error = request.pay_results[i] ;
                                                            report_error(pgm, ['No money was received from ' + session_info.contact.alias, request.pay_results[i]], {group_debug_seq: group_debug_seq, end_group_operation: false}) ;
                                                        }
                                                    }
                                                    else {
                                                        // is sender. sender is sending money. pay_results[i] must null
                                                        if (request.pay_results[i] != null) {
                                                            error = 'Error. Expected pay_results[' + i + '] to be null. Found ' + request.pay_results[i] ;
                                                            report_error(pgm, error, {group_debug_seq: group_debug_seq}, function () {
                                                                send_w2_cleanup_mt(error) ;
                                                            }) ;
                                                            return ;
                                                        }
                                                    }
                                                }

                                                // open wallet before any get transaction calls
                                                wallet_was_open = (wallet_info.status == 'Open') ;
                                                optional_open_wallet = function (cb) {
                                                    var is_wallet_required, i, money_transaction, error ;
                                                    if (wallet_was_open) return cb() ;
                                                    if (!no_pay_ok) return cb() ;
                                                    // wallet log in is required
                                                    if (!status.wallet_id || !status.wallet_password) {
                                                        error = ['Money transaction failed', 'Cannot open wallet', 'No wallet log in was found'] ;
                                                        console.log(pgm + 'todo: save received transaction in ls (no_pay_ok>0 or no_pay_error>0)');
                                                        console.log(pgm + 'todo: update file with money transaction status');
                                                        return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                    }
                                                    // open wallet
                                                    btcService.init_wallet(status.wallet_id, status.wallet_password, function (error) {
                                                        try {
                                                            if (error && (wallet_info.status != 'Open')) {
                                                                if (error.match(/Access-Control-Allow-Origin/)) return btc_cross_domain_error('Cannot open wallet', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                                error = ['Money transaction failed', 'Open wallet request failed', error] ;
                                                                console.log(pgm + 'todo: save updated money transaction in ls');
                                                                console.log(pgm + 'todo: update file with money transaction status');
                                                                return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                            }
                                                            // continue with send_money and check transaction operations
                                                            cb() ;
                                                        }
                                                        catch (e) {
                                                            error = ['Money transaction failed', 'Open wallet request failed', e.message];
                                                            console.log(pgm + 'todo: save updated money transaction in ls');
                                                            console.log(pgm + 'todo: update file with money transaction status');
                                                            return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                        }
                                                    }); // init_wallet callback

                                                } ; // optional_open_wallet

                                                optional_close_wallet = function (cb) {
                                                    if (wallet_was_open) return cb() ;
                                                    if (wallet_info.status != 'Open') return cb() ;
                                                    // close wallet
                                                    btcService.close_wallet(function (res) {
                                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                        cb() ;
                                                    });
                                                } ; // optional_close_wallet

                                                // start callback sequence (open wallet, check_money, close wallet)
                                                optional_open_wallet(function () {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' optional_open_wallet callback 3/' + group_debug_seq + ': ';
                                                    var check_money ;

                                                    // send/check money loop (if any Send or check money transactions in money_transactions array)
                                                    check_money = function (i) {
                                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.check_money/' + group_debug_seq + ': ';
                                                        var money_transaction;
                                                        if (i >= session_info.money_transactions.length) {
                                                            console.log(pgm + 'done checking money. ');
                                                            // mark w2_end_mt message as received. do not process again
                                                            session_info.w2_end_mt_received_at = new Date().getTime() ;
                                                            optional_close_wallet(function() {
                                                                send_w2_cleanup_mt() ;
                                                            }) ;
                                                            return;
                                                        }
                                                        // is sender
                                                        money_transaction = session_info.money_transactions[i];
                                                        if (!money_transaction) console.log(pgm + 'error. session_info.money_transactions.length = ' + session_info.money_transactions.length + ', i = ' + i) ;
                                                        if (money_transaction.code != 'tBTC') return check_money(i + 1); // not test Bitcoins
                                                        if (money_transaction.action != 'Request') return check_money(i + 1); // not requesting money
                                                        if (!money_transaction.btc_receive_ok) return check_money(i+1) ; // failed request money operation

                                                        // check bitcoin transactionid
                                                        btcService.get_transaction(money_transaction.btc_receive_ok, function (err, tx) {
                                                            var amount_bitcoin, expected_amount, received_amount, j, output, amount_btc, amount_satoshi ;
                                                            console.log(pgm + 'err = ' + JSON.stringify(err)) ;
                                                            console.log(pgm + 'tx = ' + JSON.stringify(tx)) ;
                                                            if (err && err.crossDomain) return btc_cross_domain_error('Cannot verify bitcoin transactionid', restart_receive_message, session_info, group_debug_seq) ; // halt processing
                                                            if (err && err.code == 404) {
                                                                //err = {"code":404}
                                                                //tx = {"code":404,"msg":"Transaction not found"}
                                                                // transactionid format is OK but btc.com transaction lookup failed.
                                                                // could be a distribution issue. try again in <n> seconds. n in 60, 120, 240 seconds
                                                                if (!money_transaction.btc_receive_not_found || money_transaction.btc_receive_not_found < 240) {
                                                                    if (!money_transaction.btc_receive_not_found) money_transaction.btc_receive_not_found = 30 ;
                                                                    console.log(pgm + 'transaction was not found. retry in ' + money_transaction.btc_receive_not_found + ' seconds') ;
                                                                    money_transaction.btc_receive_not_found = money_transaction.btc_receive_not_found * 2 ;
                                                                    setTimeout(restart_receive_message, money_transaction.btc_receive_not_found*1000) ;
                                                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}) ;
                                                                    return ;
                                                                }
                                                            }
                                                            if (err) {
                                                                // get transaction failed. maybe API error. maybe invalid transactionid
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. btc error = ' + err ;
                                                                return check_money(i + 1);
                                                            }
                                                            // check tx
                                                            if (!tx) {
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. tx is null' ;
                                                                return check_money(i + 1);
                                                            }
                                                            if (!tx.outputs || !tx.outputs.length) {
                                                                money_transaction.btc_receive_error = 'Receive money failed. Could not verify received bitcoin transaction ' + money_transaction.btc_receive_ok + '. tx.outputs is empty' ;
                                                                return check_money(i + 1);
                                                            }
                                                            // check amount
                                                            amount_bitcoin = typeof money_transaction.amount == 'number' ? money_transaction.amount : parseFloat(money_transaction.amount) ;
                                                            expected_amount = Math.round(amount_bitcoin * one_hundred_millions) ;
                                                            received_amount = 0 ;
                                                            for (j=0 ; j<tx.outputs.length ; j++) {
                                                                output = tx.outputs[j] ;
                                                                if (output.address == money_transaction.json.address) received_amount = received_amount + output.value ;
                                                            }
                                                            console.log(pgm + 'expected_amount = ' + expected_amount + ', received_amount = ' + received_amount) ;
                                                            if (Math.round(Math.abs(expected_amount - received_amount)) == 0) {
                                                                amount_btc = amount_bitcoin.toFixed(8) ;
                                                                amount_satoshi = expected_amount ;
                                                                // report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was received from ' + session_info.contact.alias], {group_debug_seq: group_debug_seq, end_group_operation: false, type: 'done'}) ;
                                                                report_error(pgm, [amount_btc + ' tBTC / ' + amount_satoshi + ' test satoshi', 'was received from ' + session_info.contact.alias], {type: 'done'}) ; // use new group_debug_seq for notification
                                                                return check_money(i + 1);
                                                            }
                                                            console.log(pgm + 'error: expected amount <> received amount. todo: notification in UI') ;
                                                            money_transaction.btc_receive_error = 'Expected ' + expected_amount + ' satoshi. Received ' + received_amount + ' satoshi' ;
                                                            check_money(i + 1);
                                                        }) ;

                                                    }; // check_money
                                                    // start check money loop
                                                    check_money(0);

                                                }) ; // optional_open_wallet callback 3

                                            }
                                            catch (e) {
                                                // receive offline message w2_start_mt failed.
                                                // notification in w2 and mn UI
                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                throw(e);
                                            }
                                        }) ; // delete_old_w2_start_mt_msg callback 2

                                    }
                                    catch (e) {
                                        // receive offline message w2_start_mt failed.
                                        // notification in w2 and mn UI
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                        throw(e);
                                    }

                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive offline message w2_start_mt failed.
                                // notification in w2 and mn UI
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return ; // no OK response to offline w2_start_mt
                        // w2_end_mt
                    }
                    else if (request.msgtype == 'w2_cleanup_mt') {
                        // sender to receiver: after w2_end_mt message. cleanup files on user dictionary and session_info
                        //request = {"msgtype":"w2_cleanup_mt"} ;
                        (function w2_cleanup_mt(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            try {
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq}, function (session_info)  {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    try {
                                        var delete_old_w2_end_mt_msg ;

                                        console.log(pgm + 'session_info = ' + JSON.stringify(session_info));
                                        if (!session_info) {
                                            error = ['Money transaction failed', 'w2_cleanup_mt message with unknown sessionid', encrypt2.sessionid];
                                            return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                        }

                                        if (session_info.w2_cleanup_mt_received_at) {
                                            // ignore. already received. must be a wallet page load. see load_w_sessions
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return ;
                                        }

                                        // 1) must be receiver
                                        if (session_info.sender) {
                                            console.log(pgm + 'warning. is sender of money transaction. ignoring incoming w2_cleanup_mt message. only sent from sender of money transaction to receiver of money transaction');
                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                            return;
                                        }

                                        // cleanup old outgoing files:
                                        // - is "receiver"
                                        // - is receiving w2_cleanup_mt message from "sender"
                                        // - "sender" must have received "w2_end_mt" message from "receiver"
                                        // - find and delete old w2_end_mt message from receiver to sender

                                        console.log(pgm + 'received w2_cleanup_mt. Not sending any msg to other wallet. update transaction status in file system to 6: received w2_cleanup_mt, done');

                                        delete_old_w2_end_mt_msg = function(cb) {
                                            delete_old_msg({session_info: session_info, msg_name: 'w2_end_mt', encrypt: encrypt2, group_debug_seq: group_debug_seq}, cb) ;
                                        } ;
                                        delete_old_w2_end_mt_msg(function() {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' delete_old_w2_end_mt_msg callback 2/' + group_debug_seq + ': ';
                                            var status, options ;
                                            try {
                                                if (request.error) {
                                                    // w2_end_mt check failed. money transaction was aborted by sender of money transaction
                                                    console.log(pgm + 'todo: mark money transaction as aborted in ls');
                                                    console.log(pgm + 'todo: update file with money transaction status');
                                                    return report_error(pgm, error, {group_debug_seq: group_debug_seq}) ;
                                                }
                                                // update money transaction status
                                                status = '6: receive w2_cleanup_mt, done' ;
                                                options = {
                                                    optional: session_info.ip_external ? '-o' : '',
                                                    group_debug_seq: group_debug_seq
                                                } ;
                                                encrypt2.update_wallet_status(status, options, function (res) {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' update_wallet_status callback 3/' + group_debug_seq + ': ';
                                                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                    // cleanup
                                                    session_info.w2_cleanup_mt_received_at = new Date().getTime() ;
                                                    session_info.this_status = status ;
                                                    cleanup_session_info(session_info) ;
                                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                                        z_publish({publish: true, reason: request.msgtype});
                                                    }) ;
                                                }) ;

                                            }
                                            catch (e) {
                                                // receive offline message w2_cleanup_mt failed.
                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                throw(e);
                                            }
                                        }) ; // delete_old_w2_end_mt_msg callback 2

                                    }
                                    catch (e) {
                                        // receive offline message w2_cleanup_mt failed.
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                        throw(e);
                                    }

                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive offline message w2_cleanup_mt failed.
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return ; // no OK response to offline w2_cleanup_mt
                        // w2_cleanup_mt
                    }
                    else if (request.msgtype == 'status_mt') {
                        // received money transaction status from other wallet. short text.
                        (function status_mt() {
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            var inner_path ;
                            try {
                                // 1: load session_info
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq}, function (session_info)  {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    var error ;
                                    if (!session_info) {
                                        error = 'error. could not find session_info for wallet session with sessionid ' + encrypt2.sessionid ;
                                        console.log(pgm + error) ;
                                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                        return ;
                                    }
                                    session_info.other_status = request.status ;
                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() {
                                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                    }) ;
                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive message status_mt failed.
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return ;
                        // status_mt
                    }
                    else if (request.msgtype == 'timeout') {
                        // timeout message from MoneyNetwork. MoneyNetwork sent response after timeout. There may be a timeout failure in W2 session
                        // merge MN process information and wallet process information.
                        MoneyNetworkAPILib.debug_group_operation_receive_stat(encrypt2, request.stat) ;
                    }
                    else if (request.msgtype == 'waiting_for_file') {
                        // timeout for optional fileGet operation in other wallet session
                        // could be issue with using optional files in money transaction and ZeroNet port closed.
                        // ip_external returned in serverInfo maybe old and wrong.
                        // workaround is to change missing optional file to a normal file and publish
                        (function waiting_for_file(){
                            var pgm = service + '.process_incoming_message.' + request.msgtype + '/' + group_debug_seq + ': ';
                            var inner_path ;
                            try {
                                // 1: load session_info
                                read_w_session(encrypt2.sessionid, {group_debug_seq: group_debug_seq}, function (session_info)  {
                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' read_w_session callback 1/' + group_debug_seq + ': ';
                                    var error ;
                                    if (!session_info) {
                                        error = 'error. could not find session_info for wallet session with sessionid ' + encrypt2.sessionid ;
                                        console.log(pgm + error) ;
                                        MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                        return ;
                                    }
                                    // check files
                                    if (!session_info.files) session_info.files = {} ;
                                    if (!session_info.files[request.filename]) {
                                        console.log(pgm + 'warning. ' + request.filename + ' is not in files. Maybe a w2_cleanup_mt message?') ;
                                        console.log(pgm + 'files = ' + JSON.stringify(session_info.files)) ;
                                    }
                                    try {
                                        // 2: read old file
                                        inner_path = encrypt2.this_user_path + request.filename ;
                                        z_file_get(pgm, {inner_path: inner_path, group_debug_seq: group_debug_seq}, function (json_str, extra) {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' z_file_get callback 2/' + group_debug_seq + ': ';
                                            var error, json, re ;
                                            try {
                                                if (!json_str) {
                                                    // OK. file deleted by W2 cleanup utility after page reload.
                                                    error = 'ignoring waiting_for_file message. could not find ' + inner_path ;
                                                    console.log(pgm + error) ;
                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                                    return ;
                                                }
                                                re = /^[0-9a-f]{10}(-e|-o)?\.[0-9]{13}$/ ;
                                                if (!request.filename.match(re)) {
                                                    error = 'error. waiting_for_file message should only be used for -e (external) and -o (offline) optional files' ;
                                                    console.log(pgm + error) ;
                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                                    return ;
                                                }
                                                // 3: delete old file
                                                MoneyNetworkAPILib.z_file_delete(pgm, inner_path, function (res) {
                                                    var pgm = service + '.process_incoming_message.' + request.msgtype + ' z_file_delete callback 3/' + group_debug_seq + ': ';
                                                    var new_filename, new_inner_path, old_request ;
                                                    try {
                                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                        if (res != 'ok') {
                                                            error = 'error. could not delete ' + inner_path + '. res = ' + JSON.stringify(res) ;
                                                            console.log(pgm + error) ;
                                                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                                            return ;
                                                        }
                                                        if (!session_info.files) session_info.files = {} ;
                                                        old_request = session_info.files[request.filename] ;
                                                        delete session_info.files[request.filename] ;
                                                        if (!ls.w_files) ls.w_files = {} ;
                                                        delete ls.w_files[request.filename] ;

                                                        // 4: write new file
                                                        new_filename = request.filename.substr(0,10) + '.' + request.filename.substr(-13) ;
                                                        new_inner_path = encrypt2.this_user_path + new_filename ;
                                                        // json_raw = unescape(encodeURIComponent(JSON.stringify(json, null, "\t")));
                                                        MoneyNetworkAPILib.z_file_write(pgm, new_inner_path, btoa(json_str), {group_debug_seq: group_debug_seq}, function (res) {
                                                            var pgm = service + '.process_incoming_message.' + request.msgtype + ' z_file_write callback 4/' + group_debug_seq + ': ';
                                                            try {
                                                                console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                                                if (res != 'ok') {
                                                                    error = 'error. could not write ' + new_inner_path + '. res = ' + JSON.stringify(res) ;
                                                                    console.log(pgm + error) ;
                                                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, error) ;
                                                                    if (old_request) save_w_session(session_info) ;
                                                                    return ;
                                                                }
                                                                if (old_request) session_info.files[new_filename] = old_request ;
                                                                if (!ls.w_files) ls.w_files = {} ;
                                                                ls.w_files[new_filename] = true ;
                                                                // publish change from optional to normal file.
                                                                // other session should be able to read normal file.

                                                                // 5: save session info
                                                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                                                if (old_request) {
                                                                    save_w_session(session_info, {group_debug_seq: group_debug_seq}, function() { // xxx
                                                                        z_publish({publish: true, reason: new_filename}) ;
                                                                    })
                                                                }
                                                                else z_publish({publish: true, reason: new_filename})
                                                            }
                                                            catch (e) {
                                                                // receive message waiting_for_file failed.
                                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                                console.log(pgm + e.message);
                                                                console.log(e.stack);
                                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                                throw(e);
                                                            }
                                                        }) ; // z_file_write callback 4
                                                    }
                                                    catch (e) {
                                                        // receive message waiting_for_file failed.
                                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                                        console.log(pgm + e.message);
                                                        console.log(e.stack);
                                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                        throw(e);
                                                    }
                                                }) ; // z_file_delete callback 3
                                            }
                                            catch (e) {
                                                // receive message waiting_for_file failed.
                                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                                console.log(pgm + e.message);
                                                console.log(e.stack);
                                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                                throw(e);
                                            }
                                        }) ; // z_file_get callback 2
                                    }
                                    catch (e) {
                                        // receive message waiting_for_file failed.
                                        if (!e) return ; // exception in MoneyNetworkAPI instance
                                        console.log(pgm + e.message);
                                        console.log(e.stack);
                                        report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                        throw(e);
                                    }
                                }) ; // read_w_session callback 1
                            }
                            catch (e) {
                                // receive message waiting_for_file failed.
                                if (!e) return ; // exception in MoneyNetworkAPI instance
                                console.log(pgm + e.message);
                                console.log(e.stack);
                                report_error(pgm, ["JS exception", e.message], {log: false, group_debug_seq: group_debug_seq}) ;
                                throw(e);
                            }
                        })() ;
                        return ;
                        // waiting_for_file
                    }
                    else response.error = 'Unknown msgtype ' + request.msgtype;
                    console.log(pgm + 'response = ' + JSON.stringify(response));

                    send_response();


                } // try
                catch (e) {
                    console.log(pgm + e.message);
                    console.log(e.stack);
                    throw(e);
                } // catch

            } // process_incoming_message
            MoneyNetworkAPILib.config({cb: process_incoming_message, cb_fileget: true, cb_decrypt: true}) ;

            // encrypt2 - encrypt messages between MN and W2
            // todo: reset encrypt1 and encrypt2 when cert_user_id is set or changed
            var encrypt2 = new MoneyNetworkAPI({
                debug: 'encrypt2'
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

            // read first 'pubkeys' message from MN session
            // optional file with file format <other_session_filename>.<timestamp>
            // pubkey used by JSEncrypt (client) and pubkey2 used by cryptMessage (ZeroNet)
            function read_pubkeys (cb) {
                var pgm = service + '.read_pubkeys: ' ;
                var group_debug_seq ;
                if (!cb) cb = function() {} ;

                group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;
                MoneyNetworkAPILib.debug_group_operation_update(group_debug_seq, {msgtype: 'pubkeys'}) ;
                encrypt2.get_session_filenames({group_debug_seq: group_debug_seq}, function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.read_pubkeys get_session_filenames callback 1: ' ;
                    var pgm2, w2_query_4, debug_seq ;
                    pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                    console.log(pgm2 + 'this_session_filename = ' + this_session_filename + ', other_session_filename = ' + other_session_filename) ;
                    w2_query_4 =
                        "select " +
                        "  json.directory," +
                        "  substr(json.directory, 1, instr(json.directory,'/')-1) as hub," +
                        "  substr(json.directory, instr(json.directory,'/data/users/')+12) as auth_address," +
                        "  files_optional.filename, keyvalue.value as modified " +
                        "from files_optional, json, keyvalue " +
                        "where files_optional.filename like '" + other_session_filename + "-i.%' " +
                        "and json.json_id = files_optional.json_id " +
                        "and keyvalue.json_id = json.json_id " +
                        "and keyvalue.key = 'modified' " +
                        "order by files_optional.filename desc" ;
                    console.log(pgm2 + 'w2 query 4 = ' + w2_query_4) ;
                    debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 4', 'dbQuery', null, group_debug_seq) ;
                    ZeroFrame.cmd("dbQuery", [w2_query_4], function (res) {
                        var pgm = service + '.read_pubkeys dbQuery callback 2: ' ;
                        var pgm2, prefix, other_user_path, inner_path, re, i ;
                        MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!res || res.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + res.length + ' rows');
                        pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                        prefix = "Error. MN-W2 session handshake failed. " ;
                        // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        if (!res || res.error) {
                            console.log(pgm2 + prefix + 'cannot read pubkeys message. dbQuery failed with ' + JSON.stringify(res)) ;
                            console.log(pgm2 + 'query = ' + w2_query_4) ;
                            status.sessionid = null ;
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, JSON.stringify(res)) ;
                            return cb(status.sessionid) ;
                        }
                        // check optional filename. pubkeys message from mn is an -i (internal) optional file
                        re = /^[0-9a-f]{10}-i\.[0-9]{13}$/ ;
                        console.log(pgm2 + 'old res.length = ' + res.length) ;
                        for (i=res.length-1 ; i >= 0 ; i--) {
                            if (!res[i].filename.match(re)) res.splice(i,1) ;
                        }
                        console.log(pgm2 + 'new res.length = ' + res.length) ;
                        if (res.length == 0) {
                            console.log(pgm2 + prefix + 'pubkeys message was not found') ;
                            console.log(pgm2 + 'w2 query 4 = ' + w2_query_4) ;
                            status.sessionid = null ;
                            MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message was not found (dbQuery)') ;
                            return cb(status.sessionid) ;
                        }

                        // mark file as read. generic process_incoming_message will not process this file
                        MoneyNetworkAPILib.wait_for_file(res[0].filename) ;

                        // first message. remember path to other session user directory. all following messages must come from same user directory
                        other_user_path = 'merged-' + get_merged_type() + '/' + res[0].directory + '/' ;
                        encrypt2.setup_encryption({other_user_path: other_user_path}) ;

                        // read file
                        inner_path = other_user_path + res[0].filename ;
                        // console.log(pgm +  inner_path + ' z_file_get start') ;
                        z_file_get(pgm, {inner_path: inner_path, required: true, group_debug_seq: group_debug_seq}, function (pubkeys_str) {
                            var pgm = service + '.read_pubkeys z_file_get callback 3: ' ;
                            var pgm2, pubkeys, now, content_signed, elapsed, error ;
                            pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                            // console.log(pgm + 'pubkeys_str = ' + pubkeys_str) ;
                            if (!pubkeys_str) {
                                console.log(pgm2 + prefix + 'read pubkeys failed. file + ' + inner_path + ' was not found') ;
                                status.sessionid = null ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message was not found (fileGet)') ;
                                return cb(status.sessionid) ;
                            }
                            // check pubkeys message timestamps. must not be old or > now.
                            now = Math.floor(new Date().getTime()/1000) ;
                            content_signed = res[0].modified ;
                            // file_timestamp = Math.floor(parseInt(res[0].filename.substr(11))/1000) ;
                            elapsed = now - content_signed ;
                            if (elapsed < 0) {
                                console.log(pgm2 + prefix + 'read pubkeys failed. file + ' + inner_path + ' signed in the future. elapsed = ' + elapsed) ;
                                status.sessionid = null ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message signed in the future') ;
                                return cb(status.sessionid) ;
                            }
                            if (elapsed > 60) {
                                console.log(pgm2 + prefix + 'read pubkeys failed. file + ' + inner_path + ' is too old. elapsed = ' + elapsed) ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message is old') ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            // console.log(pgm2 + 'timestamps: file_timestamp = ' + file_timestamp + ', content_signed = ' + content_signed + ', now = ' + now) ;
                            try {
                                pubkeys = JSON.parse(pubkeys_str) ;
                            }
                            catch (e) {
                                console.log(pgm2 + prefix + 'read pubkeys failed. file + ' + inner_path + ' is invalid. pubkeys_str = ' + pubkeys_str + ', error = ' + e.message) ;
                                status.sessionid = null ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message is invalid. ' + e.message) ;
                                return cb(status.sessionid) ;
                            }
                            error = MoneyNetworkAPILib.validate_json(pgm, pubkeys) ;
                            if (error) {
                                console.log(pgm2 + prefix + 'invalid pubkeys message. error = ' + error) ;
                                status.sessionid = null ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'pubkeys message is invalid. ' + error) ;
                                return cb(status.sessionid) ;
                            }
                            if (pubkeys.msgtype != 'pubkeys') {
                                console.log(pgm2 + prefix + 'First message from MN was NOT a pubkeys message. message = ' + JSON.stringify(pubkeys) );
                                status.sessionid = null ;
                                MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'not a pubkey message. msgtype = ' + JSON.stringify(pubkeys.msgtype)) ;
                                return cb(status.sessionid);
                            }
                            console.log(pgm2 + 'OK. received public keys from MN') ;
                            console.log(pgm2 + 'MN public keys: pubkey2 = ' + pubkeys.pubkey2 + ', pubkey = ' + pubkeys.pubkey) ;
                            encrypt2.setup_encryption({pubkey: pubkeys.pubkey, pubkey2: pubkeys.pubkey2}) ;
                            // mark file as read.

                            // return W2 public keys to MN session for full end2end encryption between the 2 sessions
                            console.log(pgm + 'Return W2 public keys to MN for full end-2-end encryption') ;
                            write_pubkeys(group_debug_seq, cb) ;

                        }) ; // z_file_get callback 3

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
                var debug_seq ;
                if (this_pubkey2 == true) { get_my_pubkey2_cbs.push(cb) ; return } // wait
                if (this_pubkey2) return cb(this_pubkey2) ; // ready
                // get pubkey2
                this_pubkey2 = true ;
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'userPublickey') ;
                ZeroFrame.cmd("userPublickey", [0], function (my_pubkey2) {
                    var pgm = service + '.get_my_pubkey2 userPublickey callback: ' ;
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, my_pubkey2 ? 'OK' : 'Failed. Not found');
                    this_pubkey2 = my_pubkey2 ;
                    console.log(pgm + 'encrypt1. setting pubkey2 = ' + my_pubkey2) ;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2}) ;
                    cb(this_pubkey2) ;
                    while (get_my_pubkey2_cbs.length) { cb = get_my_pubkey2_cbs.shift() ; cb(this_pubkey2) }
                }) ;
            } // get_my_pubkey2

            // pubkeys message from W2 to MN. public keys + a session password
            function write_pubkeys(group_debug_seq, cb) {
                var pgm = service + '.write_pubkeys: ' ;
                if (!cb) cb = function() {} ;
                // collect info before returning W2 public keys information to MN session
                get_user_path(function (user_path) {
                    var my_pubkey = get_my_pubkey() ;
                    get_my_pubkey2(function (my_pubkey2) {
                        encrypt2.add_optional_files_support({group_debug_seq: group_debug_seq}, function() {
                            var pgm = service + '.write_pubkeys get_my_pubkey2 callback 3: ' ;
                            var pgm2, request, encrypted_pwd2 ;
                            pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
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
                            // timeout in wallet test6 is 60 seconds. expire send pubkeys message in 60 seconds
                            encrypt2.send_message(request, {response: 60000, msgtype: 'pubkeys', group_debug_seq: group_debug_seq}, function (response) {
                                var pgm = service + '.write_pubkeys send_message callback 4: ' ;
                                var pgm2 ;
                                pgm2 = MoneyNetworkAPILib.get_group_debug_seq_pgm(pgm, group_debug_seq) ;
                                console.log(pgm2 + 'response = ' + JSON.stringify(response)) ;
                                if (!response.error) {
                                    // session handshake ok. save session
                                    save_mn_session(function() {cb(true) }) ;
                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq) ;
                                }
                                else {
                                    MoneyNetworkAPILib.debug_group_operation_end(group_debug_seq, 'write pubkeys failed. res = ' + JSON.stringify(response)) ;
                                    cb(false) ;
                                }
                            }) ; // send_message callback 4

                        }) ; // add_optional_files_support callback 3

                    }) ; // get_my_pubkey2 callback 2

                }) ; // get_user_path callback 1

            } // write_pubkeys

            // save MN session in W2 localStorage
            // - unencrypted:
            //   - W2 pubkey and W2 pubkey2
            //   - MN pubkey and MN pubkey2
            // - encrypted with cryptMessage (ZeroId)
            //   - session_pwd1, unlock_pwd2, this_session_filename, other_session_filename
            // - encrypted with session password
            //   - W2 prvkey
            //   - sessionid
            function save_mn_session(cb) {
                var pgm = service + '.save_mn_session: ' ;
                var array ;
                if (!cb) cb = function() {} ;
                console.log(pgm + 'saving MN session. status.sessionid = ' + status.sessionid + ', encrypt2.sessionid = ' + encrypt2.sessionid) ;
                encrypt2.get_session_filenames({}, function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.save_mn_session get_session_filenames callback 1: ' ;
                    console.log(pgm + 'saving MN session. status.sessionid = ' + status.sessionid + ', encrypt2.sessionid = ' + encrypt2.sessionid) ;
                    // cryptMessage encrypt session_pwd1, this_session_filename and other_session_filename
                    array = [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename] ;
                    encrypt1.encrypt_2(JSON.stringify(array), {}, function(encrypted_info) {
                        var pgm = service + '.save_mn_session encrypt_2 callback 2: ' ;
                        var auth_address, info, prvkey, password ;
                        console.log(pgm + 'saving MN session. status.sessionid = ' + status.sessionid + ', encrypt2.sessionid = ' + encrypt2.sessionid) ;
                        if (!ls.mn_sessions) ls.mn_sessions = {} ;
                        auth_address = ZeroFrame.site_info.auth_address ;
                        if (!ls.mn_sessions[auth_address]) ls.mn_sessions[auth_address] = {} ;
                        info = ls.mn_sessions[auth_address] ; // sessions = MN sessions. One for each auth_address
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

            } // save_mn_session

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
                var request1, request2, retry_check_merger_permission, debug_seq ;
                if (!cb) cb = function () {};
                request1 = function (cb) {
                    var pgm = service + '.check_merger_permission.request1: ';
                    var debug_seq ;
                    ZeroFrame.cmd("wrapperPermissionAdd", "Merger:MoneyNetwork", function (res) {
                        console.log(pgm + 'res = ', JSON.stringify(res));
                        if (res == "Granted") {
                            request2(cb);
                            status.merger_permission = 'Granted';
                        }
                        else cb(false);
                    });
                }; // request1
                request2 = function (cb) {
                    var pgm = service + '.check_merger_permission.request2: ';
                    get_my_wallet_hub(function (hub, other_wallet_data_hub, other_wallet_data_hub_title) {
                        var debug_seq ;
                        debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'mergerSiteAdd') ;
                        ZeroFrame.cmd("mergerSiteAdd", [hub], function (res) {
                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res == 'ok' ? 'OK' : 'Failed. res = ' + JSON.stringify(res)) ;
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
                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, null, 'mergerSiteList') ;
                ZeroFrame.cmd("mergerSiteList", {}, function (merger_sites) {
                    var pgm = service + '.check_merger_permission mergerSiteList callback 2: ';
                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, merger_sites ? 'OK' : 'Error. Not found') ;
                    console.log(pgm + 'merger_sites = ', JSON.stringify(merger_sites));
                    get_my_wallet_hub(function (hub, other_wallet_data_hub, other_wallet_data_hub_title) {
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
                var auth_address, info, encrypted_session_pwd1 ;
                if (!ls.mn_sessions) {
                    console.log(pgm + 'no old sesions found in ls. ls = ' + JSON.stringify(ls)) ;
                    return cb() ;
                } // no saved sessions
                if (!ZeroFrame.site_info) {
                    console.log(pgm + 'invalid call. ZeroFrame is still loading') ;
                    return cb() ;
                }
                if (!ZeroFrame.site_info.cert_user_id) {
                    console.log(pgm + 'invalid call. ZeroId not selected. Cert_user_id is null') ;
                    return cb() ;
                }
                auth_address = ZeroFrame.site_info.auth_address ;
                info = ls.mn_sessions[auth_address] ;
                if (!info) {
                    console.log(pgm + 'no old session was found for ' + auth_address) ;
                    return cb() ;
                }
                if (!info.encrypted_info) {
                    console.log(pgm + 'error in saved session for ' + auth_address + '. no encrypted_info. info = ' + JSON.stringify(info)) ;
                    delete ls.mn_sessions[auth_address] ;
                    ls_save() ;
                    return cb() ;
                }

                // ready for session info decrypt and get_password request
                get_user_path(function (user_path) {
                    var pgm = service + '.is_old_session get_user_path callback 1: ' ;
                    status.session_handshake = 'Checking old session' ;
                    // decrypt pwd1, this_session_filename and other_session_filename
                    console.log(pgm + 'found old session. cryptMessage decrypting "info.encrypted_info"') ;
                    encrypt1.decrypt_2(info.encrypted_info, {}, function(decrypted_info) {
                        var pgm = service + '.is_old_session decrypt_2 callback 2: ' ;
                        var array_names, array, i, temp_pwd1, request ;
                        array_names = ['session_pwd1', 'unlock_pwd2', 'this_session_filename', 'other_session_filename'] ;
                        try {
                            array = JSON.parse(decrypted_info) ; // [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename]
                        }
                        catch (e) {
                            console.log(pgm + 'error in saved session for ' + auth_address + '. Expected json string. decrypted_info = ' + decrypted_info + '. error = ' + e.message) ;
                            delete ls.mn_sessions[auth_address] ;
                            ls_save() ;
                            return cb() ;
                        }
                        if (!Array.isArray(array)) {
                            console.log(pgm + 'error in saved session for ' + auth_address + '. Expected array. found ' + (typeof array) + '. decrypted_info = ' + decrypted_info) ;
                            delete ls.mn_sessions[auth_address] ;
                            ls_save() ;
                            return cb() ;
                        }
                        if (array.length != array_names.length) {
                            console.log(pgm + 'error in saved session for ' + auth_address + '. Expected encrypted_info array.length = ' + array_names.length + '. Found length = ' + array.length) ;
                            delete ls.mn_sessions[auth_address] ;
                            ls_save() ;
                            return cb() ;
                        }
                        for (i=0; i<array_names.length ; i++) {
                            if (typeof array[i] != 'string') {
                                console.log(pgm + 'error in saved session for ' + auth_address + '. Expected ' + array_names[i] + ' to be a string. array[' + i + '] = "' + JSON.stringify(array[i]) + '"') ;
                                delete ls.mn_sessions[auth_address] ;
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
                            other_session_filename: array[3]
                        }) ;
                        // send get_password request. wait for max 10 seconds for response. MN session must be running and user must be logged in with correct account
                        request = {
                            msgtype: 'get_password',
                            pubkey: info.this_pubkey,
                            pubkey2: info.this_pubkey2,
                            unlock_pwd2: array[1]
                        } ;
                        console.log(pgm + 'found old session. sending get_password request to MN. request = ' + JSON.stringify(request)) ;
                        // using long timeout 30 seconds for slow devices. timeout message feedback cannot be used for get_password timeout. get_password is only run once at wallet page startup
                        // console.log(pgm + 'todo: change get_password timeout to 30 seconds. now just testing with a short timeout to force ping problems in mn session. https://github.com/jaros1/Money-Network/issues/199#issuecomment-345459224') ;
                        encrypt2.send_message(request, {encryptions:[1,2], response:30000}, function (response) {
                            var pgm = service + '.is_old_session send_message callback 3: ' ;
                            var temp_pwd2, temp_pwd, temp_prvkey, temp_sessionid, encrypted_pwd2, request, group_debug_seq ;
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. timeout after 5 seconds. MN session not running or not logged in
                                // error = "Timeout while waiting for response. Request was {\"msgtype\":\"get_password\",\"pubkey\":\"-----BEGIN PUBLIC KEY-----\\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHkYQzcBcq7nc8ktXslYyhkZrlja\\n7fGxu5cxqGVhp/w+905YT4jriF0IosiBeDyPGCJdQCS0IfJ9wMHP1rSIJ7KvLI5R\\nzfFcdqOMliMzEeTva29rkCmZSNw++2x7aIJQO9aExp03bm/l49zh/MbwFnZmrmS7\\nAOGgDzFPapIUQXenAgMBAAE=\\n-----END PUBLIC KEY-----\",\"pubkey2\":\"Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R\",\"unlock_pwd2\":\"280eab8147\",\"response\":1469138736361}. Expected response filename was 3253c3b046.1469138736361"
                                console.log(pgm + 'OK. Timeout for get_password request. MN session is not running, busy or not logged in. Cannot restore old session from localStorage');
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
                            status.session_handshake = 'Old session was restored from localStorage' ;
                            status.sessionid = temp_sessionid ;
                            encrypt2 = new MoneyNetworkAPI({
                                debug: 'encrypt2',
                                sessionid: temp_sessionid,
                                pubkey: info.other_pubkey,
                                pubkey2: info.other_pubkey2,
                                prvkey: temp_prvkey,
                                user_path: user_path
                            }) ;
                            // encrypt2 object must have session filenames initialized before starting group operation
                            encrypt2.get_session_filenames({}, function () {
                                var pgm = service + '.is_old_session get_session_filenames callback 4: ' ;
                                var request, timeout_at,
                                group_debug_seq = MoneyNetworkAPILib.debug_group_operation_start() ;

                                // https://github.com/jaros1/Money-Network/issues/208
                                // todo: loaded old session from Ls. No pubkeys message to MN. Send ping to MN instead so that MN known that session is up and running
                                // send ping. do not wait for response. cleanup in 30 seconds.
                                request = { msgtype: 'ping' };
                                timeout_at = new Date().getTime() + 30000 ;
                                console.log(pgm + 'restored old session. send ping to MN session with old sessionid ' + status.sessionid) ;
                                encrypt2.send_message(request, {timeout_at: timeout_at, group_debug_seq: group_debug_seq}, function (response) {
                                    var pgm = service + '.is_old_session send_message callback 5/' + group_debug_seq + ': ' ;
                                    console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                                    //if (response && response.error && response.error.match(/^Timeout /)) {
                                    //    // OK. Timeout. Continue with next session
                                    //    console.log(pgm + 'ping old sessionid ' + status.sessionid + ' timeout');
                                    //}
                                    //else if (!response || response.error) {
                                    //    // Unexpected error.
                                    //    console.log(pgm + 'ping old sessionid ' + status.sessionid + ' returned ' + JSON.stringify(response));
                                    //    info.status = 'Test failed';
                                    //    info.disabled = true;
                                    //    return test2_open_url.run();
                                    //}
                                    //else console.log(pgm + 'ping old sessionid ' + status.sessionid + ' OK') ;
                                    cb(status.sessionid) ;
                                }) ; // send_message callback 5

                            }) ; // get_session_filenames callback 4

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
                    console.log(pgm + 'invalid call. sessionid already found. status.sessionid = ' + status.sessionid + ', encrypt2.sessionid = ' + encrypt2.sessionid) ;
                    cb(status.sessionid) ;
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
                // read MN public keys message using dbQuery loop and z_file_get operations
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
            var old_auth_address ;
            function initialize (startup, cb) {
                var pgm = service + '.initialize: ' ;
                if (!cb) cb = function() {} ;
                if (!startup && old_auth_address && ZeroFrame.site_info && (old_auth_address != ZeroFrame.site_info.auth_address)) {
                    // reset session variables
                    console.log(pgm + 'changed ZeroNet certificate. reset encrypts and sessionid') ;
                    status.sessionid = null ;
                    encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ;
                    encrypt2 = new MoneyNetworkAPI({debug: 'encrypt2'}) ;
                    old_auth_address = ZeroFrame.site_info.auth_address ;
                }

                console.log(pgm + 'step 2: check merger permission') ;
                check_merger_permission(function(ok) {
                    var pgm = service + '.initialize check_merger_permission callback 1: ' ;
                    if (!ok) {
                        // no merger permission
                        console.log(pgm + 'stop initialize. no merger permission. MN-W2 session is not possible without merger permission') ;
                        return cb(null) ;
                    }

                    console.log(pgm + 'check ZeroNet log in') ;
                    if (!ZeroFrame.site_info.cert_user_id) {
                        // not logged in
                        console.log(pgm + 'stop initialize. not logged in. MN-W2 session is not possible without a ZeroNet log in') ;
                        return cb(null);
                    }
                    old_auth_address = ZeroFrame.site_info.auth_address ;
                    status.old_cert_user_id = ZeroFrame.site_info.cert_user_id ;

                    // step 3: get permissions
                    console.log(pgm + 'step 3: get permissions') ;
                    get_permissions(function (res) {
                        var pgm = service + '.initialize get_permissions callback 2: ' ;
                        console.log(pgm + 'get_permissions. res = ' + JSON.stringify(res)) ;

                        // delete old status.json file. not longer needed
                        delete_status_json(function () {
                            var pgm = service + '.initialize delete_status_json callback 3: ' ;

                            // step 4 - update wallet.json
                            console.log(pgm + 'step 4: update wallet.json') ;
                            update_wallet_json(function (res) {
                                var pgm = service + '.initialize update_wallet_json callback 4: ';
                                var optional_get_wallet_login;
                                console.log(pgm + 'update_wallet_json. res = ' + JSON.stringify(res));

                                // save_login == '1'. wallet login saved on W2 localStorage
                                optional_get_wallet_login = function (cb) {
                                    if (!ls.save_login) ls.save_login = {};
                                    if (!ls.save_login[old_auth_address]) ls.save_login[old_auth_address] = {choice: '0'};
                                    if (ls.save_login[old_auth_address].choice != '1') return cb() ; // skip. not saved or 2: saved in MN ls
                                    // wallet log in saved in w2 ls. restore now
                                    get_wallet_login('1', function(wallet_id, wallet_password, error) {
                                        console.log(pgm + 'wallet_id = ' + wallet_id + ', wallet_password = ' + wallet_password + ', error = ' + error) ;
                                        console.log(pgm + 'status = ' + JSON.stringify(status)) ;
                                        if (!error) $rootScope.$apply() ;
                                        cb() ;
                                    }) ;
                                } ;
                                optional_get_wallet_login(function(){
                                    var done ;

                                    // extend cb.
                                    // - lookup save_login[].choice (radio group) from ls
                                    // - cleanup old outgoing files
                                    done = function (sessionid) {
                                        var pgm = service + '.initialize.done: ';
                                        var save_wallet_login, w2_query_5, directory, debug_seq;
                                        // sessionid found. remember login.
                                        if (!ls.save_login) ls.save_login = {};
                                        // console.log(pgm + 'ls.save_login = ' + JSON.stringify(ls.save_login)) ;
                                        if (!ls.save_login[old_auth_address]) ls.save_login[old_auth_address] = {choice: '0'};
                                        save_wallet_login = ls.save_login[old_auth_address].choice;
                                        ls_save();

                                        // cleanup old outgoing money transaction files
                                        // do not cleanup -o offline and normal files.See cleanup_offline_session_files
                                        // find outgoing money transactions

                                        // query 1. simple get all optional files for current user directory
                                        // todo: optional files and actual files on file system can be out of sync. Should delete files_optional + sign to be sure that optional files and file system matches
                                        directory = z_cache.my_wallet_data_hub + "/data/users/" + ZeroFrame.site_info.auth_address;
                                        w2_query_5 =
                                            "select files_optional.filename from json, files_optional " +
                                            "where directory like '" + directory + "' " +
                                            "and file_name = 'content.json' " +
                                            "and files_optional.json_id = json.json_id";
                                        console.log(pgm + 'w2_query_5 = ' + w2_query_5);
                                        debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, 'w2 query 5', 'dbQuery');
                                        ZeroFrame.cmd("dbQuery", [w2_query_5], function (files) {
                                            var pgm = service + '.initialize.done dbQuery 1: ';
                                            var files, i, re, get_file_info, m, optional;
                                            MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, (!files || files.error) ? 'Failed. error = ' + JSON.stringify(res) : 'OK. Returned ' + files.length + ' rows');
                                            if (files.error) {
                                                console.log(pgm + 'query failed. error = ' + files.error);
                                                console.log(pgm + 'w2_query_5 = ' + w2_query_5);
                                                return;
                                            }
                                            // keeping only -i, -e and -p optional files in cleanup loop
                                            // todo: must add a manual cleanup for offline and manual files. Not cannot used timestamp
                                            re = new RegExp('^[0-9a-f]{10}(-i|-e|-o|-io|-p)\.[0-9]{13}$');
                                            for (i = files.length - 1; i >= 0; i--) {
                                                m = files[i].filename.match(re);
                                                if (!m) {
                                                    // not a money transaction file
                                                    files.splice(i, 1);
                                                    continue;
                                                }
                                                optional = m[1];
                                                if (['-i', '-e', '-p'].indexOf(optional) == -1) {
                                                    // offline transaction or normal file (fallback for offline transaction)
                                                    files.splice(i, 1);
                                                }
                                            }
                                            console.log(pgm + 'files = ' + JSON.stringify(files));

                                            // get file info before starting file deletes. must only delete outgoing optional files
                                            console.log(pgm + 'checking file_info for optional files list. do not delete incoming not downloaded optional files');
                                            get_file_info = function (i, cb) {
                                                var pgm = service + '.initialize.cb.get_file_info: ';
                                                var inner_path, debug_seq;
                                                if (i >= files.length) {
                                                    // done with file info lookup. continue with delete files
                                                    console.log(pgm + 'done with file info lookup. i = ' + i + ', files.length = ' + files.length + ' continue with delete files');
                                                    return cb();
                                                }
                                                inner_path = 'merged-' + get_merged_type() + '/' + directory + '/' + files[i].filename;
                                                debug_seq = MoneyNetworkAPILib.debug_z_api_operation_start(pgm, inner_path, 'optionalFileInfo');
                                                ZeroFrame.cmd("optionalFileInfo", [inner_path], function (file_info) {
                                                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, file_info ? 'OK' : 'Not found');
                                                    console.log(pgm + 'i = ' + i + ', inner_path = ' + inner_path + ', file_info = ' + JSON.stringify(file_info));
                                                    //i = 0, inner_path = merged-MoneyNetwork/1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ/data/users/18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ/aaca9a8ff7.1509003997742, file_info = null

                                                    files[i].file_info = file_info;
                                                    get_file_info(i + 1, cb);
                                                }); // optionalFileInfo callback
                                            }; // check_files
                                            get_file_info(0, function () {
                                                var pgm = service + '.initialize.done get_file_info callback 2: ';
                                                var delete_tmp_files, i, filename, file_info, this_session_filename, timestamp, delete_ok, delete_failed, delete_tmp_file;

                                                console.log(pgm + 'files with file_info = ' + JSON.stringify(files));
                                                //files with file_info = [{
                                                //    "filename": "aaca9a8ff7.1509003997742",
                                                //    "file_info": null
                                                //}];

                                                delete_tmp_files = [];
                                                for (i = 0; i < files.length; i++) {
                                                    filename = files[i].filename;
                                                    file_info = files[i].file_info;
                                                    if (!file_info) {
                                                        console.log(pgm + 'info_info (normal file or deleted optional file) = empty!');
                                                        continue;
                                                    }
                                                    if (file_info.is_downloaded && (file_info.time_added == file_info.time_downloaded)) {
                                                        console.log(pgm + 'file_info (outgoing optional file) = ' + JSON.stringify(file_info));
                                                    }
                                                    else {
                                                        console.log(pgm + 'file_info (ingoing optional file) = ' + JSON.stringify(file_info));
                                                        continue;
                                                    }
                                                    this_session_filename = filename.substr(0, 10);
                                                    if (this_session_filename != encrypt2.this_session_filename) {
                                                        // unknown (old) session
                                                        delete_tmp_files.push(filename);
                                                        continue;
                                                    }
                                                    timestamp = parseInt(filename.substr(-13));
                                                    if (!encrypt2.session_at) {
                                                        console.log(pgm + 'no session_at timestamp was found for this_session_filename = ' + this_session_filename + '. maybe not restored session. using service_started_at');
                                                        encrypt2.session_at = service_started_at;
                                                    }
                                                    if (timestamp < encrypt2.session_at) {
                                                        // old outgoing money transaction message
                                                        delete_tmp_files.push(filename);
                                                    }
                                                } // i
                                                console.log(pgm + 'delete_tmp_files = ' + JSON.stringify(delete_tmp_files));
                                                // delete_tmp_files = ["041e012302-i.1515156194073","041e012302-i.1515156203845","041e012302-i.1515156196983","041e012302-i.1515156195931","041e012302-i.1515156194945","041e012302-i.1515156204913","041e012302-i.1515156164248","041e012302-i.1515156586064"]

                                                // delete file loop
                                                delete_ok = [];
                                                delete_failed = [];
                                                delete_tmp_file = function (transaction_timestamp) {
                                                    var pgm = service + '.initialize.done.delete_tmp_file: ';
                                                    var filename, inner_path;
                                                    if (!delete_tmp_files.length) {
                                                        // finish deleting old temporary optional files (-i, -e and -p)
                                                        MoneyNetworkAPILib.end_transaction(transaction_timestamp);
                                                        if (!delete_ok.length) {
                                                            // nothing to sign
                                                            cb(sessionid, save_wallet_login);
                                                        }
                                                        // sign only. publish: false. publish is pending. see publish in cleanup_offline_session_files
                                                        else z_publish({}, function (res) {
                                                            cb(sessionid, save_wallet_login);
                                                        });
                                                        return;
                                                    } // done

                                                    filename = delete_tmp_files.shift();
                                                    inner_path = 'merged-' + get_merged_type() + '/' + z_cache.my_wallet_data_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' + filename;

                                                    // issue #1140. https://github.com/HelloZeroNet/ZeroNet/issues/1140
                                                    // false Delete error: [Errno 2] No such file or directory error returned from fileDelete
                                                    MoneyNetworkAPILib.z_file_delete(pgm, inner_path, function (res) {
                                                        if (res == 'ok') delete_ok.push(filename);
                                                        else delete_failed.push(filename);
                                                        delete_tmp_file(transaction_timestamp);
                                                    });

                                                }; // delete_tmp_file

                                                // start delete file loop
                                                // transaction. don't delete files while publishing
                                                MoneyNetworkAPILib.start_transaction(pgm, function (transaction_timestamp) {
                                                    delete_tmp_file(transaction_timestamp);
                                                });

                                            }); // done get_file_info callback 2

                                        }); // done dbQuery callback 1

                                    }; // done

                                    // todo: save_login = '1'. get wallet login before trying

                                    // check for old (1. priority) or new (2. priority) session
                                    // step 5 - check old session
                                    console.log(pgm + 'step 5: check old session');
                                    is_old_session(function (sessionid) {
                                        var pgm = service + '.initialize is_old_session callback 5: ';
                                        console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid));
                                        if (sessionid) {
                                            $rootScope.$apply();
                                            return done(sessionid);
                                        } // session was restored from localStorage
                                        // step 6 - check new session
                                        console.log(pgm + 'step 6: check new session');
                                        is_new_session(function (sessionid) {
                                            var pgm = service + '.initialize is_new_session callback 6: ';
                                            console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid));
                                            if (!sessionid) return done(null);
                                            $rootScope.$apply();
                                            save_mn_session(function () {
                                                done(sessionid)
                                            });
                                        }); // is_new_session callback 6

                                    }); // is_old_session callback 5

                                }) ;

                            }); // update_wallet_json callback 4

                        }) ; // delete_status_json callback 3

                    }) ; // get_permissions callback 2

                }) ; // check_merger_permission callback 1

            } // initialize

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

            // send current wallet balance to MN
            function send_balance (cb) {
                var pgm = service + '.send_balance: ' ;
                var request ;
                if (!status.sessionid) return cb('Cannot send balance to MoneyNetwork. No session found') ;
                if (wallet_info.status != 'Open') return cb('Cannot send balance to MoneyNetwork. Wallet not open');
                // send balance to MN
                request = {
                    msgtype: 'balance',
                    balance: [ {code: 'tBTC', amount: parseFloat(wallet_info.confirmed_balance)} ],
                    balance_at: new Date().getTime()
                } ;
                console.log(pgm + 'status.sessionid =' + status.sessionid + ', encrypt2.sessionid = ' + encrypt2.sessionid) ;
                encrypt2.send_message(request, { response: 5000}, function (response) {
                    if (!response || response.error) return cb('Could not send balance to MN. Response = ' + JSON.stringify(response)) ;
                    else cb() ;
                }) ;
            } // send_balance


            // open wallet url in a new browser tab
            // write warning in console.log. exception is raised in parent frame and cannot be catch here
            function open_window (pgm, url) {
                console.log(pgm + 'opening url ' + url + " in a new browser tab. open window maybe blocked in browser. chrome+opera: Uncaught TypeError: Cannot set property 'opener' of null") ;
                return ZeroFrame.cmd("wrapperOpenWindow", [url, "_blank"]);
            } // open_window

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
                get_status: get_status,
                save_permissions: save_permissions,
                send_balance: send_balance,
                open_window: open_window
            };

            // end W2Service
        }])

;
