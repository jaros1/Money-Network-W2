(function () {
    //var client = blocktrail.BlocktrailSDK({
    //    apiKey: "44bb2b39eaf2a164afe164560c725b4bf2842698",
    //    apiSecret: "f057354b22d9cbf9098e4c2db8e1643a3342c6fa",
    //    network: "BTC",
    //    testnet: false
    //});

    //console.log('address 1NcXPMRaanz43b1kokpPuYDdk6GGDvxT2T') ;
    //client.address('1NcXPMRaanz43b1kokpPuYDdk6GGDvxT2T',
    //    function(err, address) { console.log(1, 'err=', err, ', balance=', address.balance); });
    //client.blockLatest(
    //    function(err, block) { console.log(2, 'err=', err, ', block=', block.hash); });
    //
    //console.log('address 3AWmcu96DVFKUmxboqRLJdbez8fXD8RCak') ;
    //client.address('3AWmcu96DVFKUmxboqRLJdbez8fXD8RCak',
    //    function(err, address) { console.log(1, 'err=', err, ', balance=', address.balance); });
    //client.blockLatest(
    //    function(err, block) { console.log(2, 'err=', err, ', block=', block.hash); });

    //var client2 = blocktrail.BlocktrailSDK({
    //    apiKey: "44bb2b39eaf2a164afe164560c725b4bf2842698",
    //    apiSecret: "f057354b22d9cbf9098e4c2db8e1643a3342c6fa",
    //    network: "BTC",
    //    testnet: true
    //});
    //console.log('address 2Mt2GZWXRkbHY35X5yQV52hMyow7qP1i4EB');
    //client2.address('2Mt2GZWXRkbHY35X5yQV52hMyow7qP1i4EB',
    //    function (err, address) {
    //        console.log(1, 'err=', err, ', balance=', address.balance);
    //    });
    //client2.blockLatest(
    //    function (err, block) {
    //        console.log(2, 'err=', err, ', block=', block.hash);
    //    });
    //
    //// generate password - used as key for local storage encryption and used in client to client communication (symmetric encryption)
    //function generate_random_password(length) {
    //    var character_set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789![]{}#%&/()=?+-:;_-.@$|£';
    //    var password = [], index, char;
    //    for (var i = 0; i < length; i++) {
    //        index = Math.floor(Math.random() * character_set.length);
    //        char = character_set.substr(index, 1);
    //        password.push(char);
    //    }
    //    return password.join('');
    //} // generate_random_password
    //
    //var walletid = 'MyNewTestWallet2';
    //var walletpwd = 'rvO7w}l&h}KTFP#-2MMx)k;|Z2zB3Y';
    //
    //// create and delete wallet
    //client2.createNewWallet(walletid, walletpwd, function (err, wallet, backupInfo) {
    //    console.log('createNewWallet: ');
    //    console.log('walletid = ' + walletid);
    //    console.log('walletpwd = ' + walletpwd);
    //    console.log('err = ' + CircularJSON.stringify(err));
    //    console.log('wallet = ' + CircularJSON.stringify(wallet));
    //    console.log('backupInfo = ' + CircularJSON.stringify(backupInfo));
    //    //backupInfo = {
    //    //    "walletVersion": "v3",
    //    //    "encryptedPrimarySeed": "library faculty abandon wave tattoo tree pause make come amount abandon ability dutch forward foster shaft family virtual orient ski town fashion model coast flower call carpet supreme vote rigid civil anxiety ugly stamp witness aunt rather scorpion deer kitten nuclear behave cupboard often loud scare fashion office smart success improve ask exclude aim light ask act name monitor embody",
    //    //    "backupSeed": "remain vehicle hidden memory forum shell rose priority hair busy help wealth truck ability forward buyer sing attack inject random letter scene park window",
    //    //    "recoveryEncryptedSecret": "library file sudden sphere wagon peanut truly fork father session abandon access public mango pioneer general alone wonder vital alter spell link blast problem armed ice west enjoy raw glare table oblige soul tool drip tilt loyal ghost rifle drop replace sauce click reflect wet diamond twice draft hunt invite expand author fantasy private carpet grit chase tortoise hurdle art",
    //    //    "encryptedSecret": "library fancy monitor planet crowd flame project breeze primary session abandon absurd clap heart gift guide agent want solve sustain only toy jewel soon kick provide define must unveil video garlic mansion cause muscle claw engage forum rail frown border girl mushroom sugar already share city aunt discover hip sibling wild potato merge alien sad column usual hazard inch orchard",
    //    //    "blocktrailPublicKeys": {
    //    //        "0": {
    //    //            "chainCode": {
    //    //                "type": "Buffer",
    //    //                "data": [91, 142, 213, 185, 176, 118, 98, 144, 136, 210, 113, 88, 42, 79, 129, 207, 120, 242, 59, 192, 248, 105, 135, 33, 205, 70, 91, 114, 72, 80, 68, 152]
    //    //            },
    //    //            "depth": 1,
    //    //            "index": 2147483648,
    //    //            "parentFingerprint": 500625266,
    //    //            "network": {
    //    //                "magicPrefix": "\u0018Bitcoin Signed Message:\n",
    //    //                "bip32": {"public": 70617039, "private": 70615956},
    //    //                "pubKeyHash": 111,
    //    //                "scriptHash": 196,
    //    //                "wif": 239,
    //    //                "dustThreshold": 546,
    //    //                "feePerKb": 10000
    //    //            },
    //    //            "pubKey": {
    //    //                "compressed": true,
    //    //                "Q": {
    //    //                    "curve": {
    //    //                        "p": {
    //    //                            "0": 67107887,
    //    //                            "1": 67108799,
    //    //                            "2": 67108863,
    //    //                            "3": 67108863,
    //    //                            "4": 67108863,
    //    //                            "5": 67108863,
    //    //                            "6": 67108863,
    //    //                            "7": 67108863,
    //    //                            "8": 67108863,
    //    //                            "9": 4194303,
    //    //                            "t": 10,
    //    //                            "s": 0
    //    //                        },
    //    //                        "a": {"0": 0, "t": 0, "s": 0},
    //    //                        "b": {"0": 7, "t": 1, "s": 0},
    //    //                        "G": {
    //    //                            "curve": "~blocktrailPublicKeys~0~pubKey~Q~curve",
    //    //                            "x": {
    //    //                                "0": 49813400,
    //    //                                "1": 10507973,
    //    //                                "2": 42833311,
    //    //                                "3": 57456440,
    //    //                                "4": 50502652,
    //    //                                "5": 60932801,
    //    //                                "6": 33958236,
    //    //                                "7": 49197398,
    //    //                                "8": 41875932,
    //    //                                "9": 1994649,
    //    //                                "t": 10,
    //    //                                "s": 0
    //    //                            },
    //    //                            "y": {
    //    //                                "0": 51434680,
    //    //                                "1": 32777214,
    //    //                                "2": 21076420,
    //    //                                "3": 19044885,
    //    //                                "4": 16586676,
    //    //                                "5": 58999338,
    //    //                                "6": 38780864,
    //    //                                "7": 51484022,
    //    //                                "8": 41363107,
    //    //                                "9": 1183414,
    //    //                                "t": 10,
    //    //                                "s": 0
    //    //                            },
    //    //                            "z": {"0": 1, "t": 1, "s": 0},
    //    //                            "_zInv": null,
    //    //                            "compressed": true
    //    //                        },
    //    //                        "n": {
    //    //                            "0": 3555649,
    //    //                            "1": 9937716,
    //    //                            "2": 33799165,
    //    //                            "3": 60472610,
    //    //                            "4": 45788892,
    //    //                            "5": 67108863,
    //    //                            "6": 67108863,
    //    //                            "7": 67108863,
    //    //                            "8": 67108863,
    //    //                            "9": 4194303,
    //    //                            "t": 10,
    //    //                            "s": 0
    //    //                        },
    //    //                        "h": {"0": 1, "t": 1, "s": 0},
    //    //                        "infinity": {
    //    //                            "curve": "~blocktrailPublicKeys~0~pubKey~Q~curve",
    //    //                            "x": null,
    //    //                            "y": null,
    //    //                            "z": {"t": 0, "s": 0},
    //    //                            "_zInv": null,
    //    //                            "compressed": true
    //    //                        },
    //    //                        "pOverFour": {
    //    //                            "0": 67108620,
    //    //                            "1": 67108847,
    //    //                            "2": 67108863,
    //    //                            "3": 67108863,
    //    //                            "4": 67108863,
    //    //                            "5": 67108863,
    //    //                            "6": 67108863,
    //    //                            "7": 67108863,
    //    //                            "8": 67108863,
    //    //                            "9": 1048575,
    //    //                            "s": 0,
    //    //                            "t": 10
    //    //                        },
    //    //                        "pLength": 32
    //    //                    },
    //    //                    "x": {
    //    //                        "0": 41041474,
    //    //                        "1": 25940419,
    //    //                        "2": 65448900,
    //    //                        "3": 65375010,
    //    //                        "4": 4158729,
    //    //                        "5": 10853470,
    //    //                        "6": 21686530,
    //    //                        "7": 62634359,
    //    //                        "8": 43880956,
    //    //                        "9": 3897986,
    //    //                        "10": 0,
    //    //                        "t": 10,
    //    //                        "s": 0
    //    //                    },
    //    //                    "y": {
    //    //                        "0": 65515255,
    //    //                        "1": 63548786,
    //    //                        "2": 35692134,
    //    //                        "3": 3738579,
    //    //                        "4": 10262155,
    //    //                        "5": 22916535,
    //    //                        "6": 37514353,
    //    //                        "7": 9753636,
    //    //                        "8": 65310385,
    //    //                        "9": 2682093,
    //    //                        "s": 0,
    //    //                        "t": 10
    //    //                    },
    //    //                    "z": "~blocktrailPublicKeys~0~pubKey~Q~curve~G~z",
    //    //                    "_zInv": {"0": 1, "t": 1, "s": 0},
    //    //                    "compressed": true
    //    //                }
    //    //            }
    //    //        }
    //    //    }
    //    //};
    //
    //    wallet.deleteWallet(
    //        function () {
    //            console.log('deleteWalletOK (1): arguments.length = ' + arguments.length);
    //            for (i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
    //            // deleteWalletOK: arguments.length = 2
    //            // all.js:69845 arguments[0] = null
    //            // all.js:69845 arguments[1] = true
    //        },
    //        function (args) {
    //            console.log('deleteWalletError (1): arguments.length = ' + arguments.length);
    //            for (i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
    //        }
    //    );
    //
    //});

    //// initialize and delete
    //client2.initWallet(walletid, walletpwd, function (err, wallet) {
    //    console.log('initWallet:');
    //    console.log('err  ' + CircularJSON.stringify(err));
    //    console.log('wallet = ' + CircularJSON.stringify(wallet));
    //
    //    wallet.deleteWallet(
    //        function () {
    //            console.log('deleteWalletOK (2): arguments.length = ' + arguments.length);
    //            for (i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
    //            // deleteWalletOK: arguments.length = 2
    //            // all.js:69845 arguments[0] = null
    //            // all.js:69845 arguments[1] = true
    //        },
    //        function (args) {
    //            console.log('deleteWalletError (2): arguments.length = ' + arguments.length);
    //            for (i = 0; i < arguments.length; i++) console.log('arguments[' + i + '] = ' + CircularJSON.stringify(arguments[i]));
    //        }
    //    );
    //
    //});

})();



