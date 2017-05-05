(function (){
    var client = blocktrail.BlocktrailSDK({apiKey: "MY_APIKEY", apiSecret: "MY_APISECRET", network: "BTC", testnet: false});

    console.log('address 1NcXPMRaanz43b1kokpPuYDdk6GGDvxT2T') ;
    client.address('1NcXPMRaanz43b1kokpPuYDdk6GGDvxT2T',
        function(err, address) { console.log(1, 'err=', err, ', balance=', address.balance); });
    client.blockLatest(
        function(err, block) { console.log(2, 'err=', err, ', block=', block.hash); });

    console.log('address 3AWmcu96DVFKUmxboqRLJdbez8fXD8RCak') ;
    client.address('3AWmcu96DVFKUmxboqRLJdbez8fXD8RCak',
        function(err, address) { console.log(1, 'err=', err, ', balance=', address.balance); });
    client.blockLatest(
        function(err, block) { console.log(2, 'err=', err, ', block=', block.hash); });


})() ;



