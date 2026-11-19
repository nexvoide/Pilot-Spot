export interface TrackedWallet {
  name: string;
  address: string;
  capitalSnapshot?: { valueUsd: number; asOf: string };
}

// Capital values are historical snapshots; absent values have not been verified.
export const trackedWallets: readonly TrackedWallet[] = [
  {
    name: "Sub18",
    address: "0x3ff54fd26855db3758d0b5ae7aed47440c47f705",
  },
  {
    name: "Aguila",
    address: "0x1f250df59a777d61cb8bd043c12970f3afe4f925",
  },
  {
    name: "Doremos",
    address: "0xdcb45a8992c3cea077c3d631ee92572f64778858",
  },
  {
    name: "Shizuka",
    address: "0x4c38ac78bfdda318bd6f15312b34585b0ca72d07",
  },
  {
    name: "Giyan",
    address: "0xe4d1fa7e6141f9131345117bdb8b5701bca67662",
  },
  {
    name: "Sonio",
    address: "0x5f64c8c5c5d0811130c3a314bcf2c791aa6e6452",
  },
  {
    name: "Dekisogi",
    address: "0x54c5b295195ffa2613ab4f3893b29afdb8a49558",
  },
  {
    name: "Charles",
    address: "0x52a139ec4940ac130b0e50de39da8a696ba6633a",
    capitalSnapshot: {
      valueUsd: 16424598.258357,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Katrina",
    address: "0x8455193b0490ad091819000b01cd9bb833ac974b",
  },
  {
    name: "Sunny",
    address: "0x06a745f3ad5a71bd3ad65b4103c0ac210b581c75",
  },
  {
    name: "Abraxas Solo",
    address: "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
  },
  {
    name: "Abraxas Duo",
    address: "0xb83de012dba672c76a7dbbbf3e459cb59d7d6e36",
  },
  {
    name: "Felix",
    address: "0x85ecf584f25db6f146718b86d493e33c5af72052",
    capitalSnapshot: {
      valueUsd: 58394762.121474,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Owen",
    address: "0x399965e15d4e61ec3529cc98b7f7ebb93b733336",
    capitalSnapshot: {
      valueUsd: 26109095.839690007,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Elliot",
    address: "0x7839e2f2c375dd2935193f2736167514efff9916",
    capitalSnapshot: {
      valueUsd: 11936613.294576999,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Allen",
    address: "0xecb63caa47c7c4e77f60f1ce858cf28dc2b82b00",
    capitalSnapshot: {
      valueUsd: 89593768.488558,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Richard",
    address: "0xc926ddba8b7617dbc65712f20cf8e1b58b8598d3",
    capitalSnapshot: {
      valueUsd: 26292266.207426,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Colin",
    address: "0xff4cd3826ecee12acd4329aada4a2d3419fc463c",
    capitalSnapshot: {
      valueUsd: 45606877.42697701,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Carter",
    address: "0xfc667adba8d4837586078f4fdcdc29804337ca06",
    capitalSnapshot: {
      valueUsd: 66158956.858076,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jack",
    address: "0x5c9b84105d63f0c8ed35fd62f66d9b8c6800ce01",
    capitalSnapshot: {
      valueUsd: 12344249.038727,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Blake",
    address: "0xeeb56331b6a250fe2dbc123f08bdb87aa9840464",
    capitalSnapshot: {
      valueUsd: 12026209.145978002,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Sebastian",
    address: "0x6355f7cf36b24044cd5b089a845113327d0ee58e",
    capitalSnapshot: {
      valueUsd: 23331112.487513,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Edward",
    address: "0x57dd78cd36e76e2011e8f6dc25cabbaba994494b",
    capitalSnapshot: {
      valueUsd: 18126351.407484,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Luke",
    address: "0x31dea2516beee92135b96f464eeec3cf292a13f2",
    capitalSnapshot: {
      valueUsd: 12698461.251705,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "BobbyBigSize",
    address: "0x7fdafde5cfb5465924316eced2d3715494c517d1",
    capitalSnapshot: {
      valueUsd: 28652531.564285003,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "John Wick",
    address: "0xfc27136e42af1732ddc9ce2605ea9bff1b959d9d",
    capitalSnapshot: {
      valueUsd: 35242031.135253,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Evan",
    address: "0x856c35038594767646266bc7fd68dc26480e910d",
    capitalSnapshot: {
      valueUsd: 66873951.847761005,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Auros",
    address: "0x023a3d058020fb76cca98f01b3c48c8938a22355",
    capitalSnapshot: {
      valueUsd: 15906029.342024,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "2 freres 2 fauves",
    address: "0x49e96e255ba418d08e66c35b588e2f2f3766e1d0",
    capitalSnapshot: {
      valueUsd: 31276254.479713,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Michael",
    address: "0x024294c53a69c1e6b39810b3fac87385752fffa1",
    capitalSnapshot: {
      valueUsd: 23700560.186648,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Theodore",
    address: "0xdcac85ecae7148886029c20e661d848a4de99ce2",
    capitalSnapshot: {
      valueUsd: 15350824.777167004,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Andrew",
    address: "0x0b8aa35c28b7c6ab18f11dc168f437a8a69fd4f8",
    capitalSnapshot: {
      valueUsd: 44887672.171919,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Walter",
    address: "0xe81309ec9b79309e4d108ae3a92d1aa618cd6d74",
    capitalSnapshot: {
      valueUsd: 14730857.791958,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Martin",
    address: "0xae6446c95cc4e455e9cf56f28757ab728d88e81e",
    capitalSnapshot: {
      valueUsd: 12643620.329132998,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Harrison",
    address: "0x8def9f50456c6c4e37fa5d3d57f108ed23992dae",
    capitalSnapshot: {
      valueUsd: 40332725.323645,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "George",
    address: "0x58b27998b4ff896949d5f57466b259e50ee211f3",
    capitalSnapshot: {
      valueUsd: 10124067.664351,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Cedric",
    address: "0xfe7ce058edc7cfcde9ef8262ba51f8d4796ab7ae",
    capitalSnapshot: {
      valueUsd: 41914753.37845,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Anthony",
    address: "0x64b766b07362405a9cc19c2226490f3015929da9",
    capitalSnapshot: {
      valueUsd: 19332380.658163,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Spencer",
    address: "0xd8c5228c515db3043dfa0c8cd6f22450ee9a99b0",
    capitalSnapshot: {
      valueUsd: 22866153.18487,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Adam",
    address: "0x325edd95bb016c36027ce3b9f7595af7094a9564",
    capitalSnapshot: {
      valueUsd: 10497930.832273,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Zachary",
    address: "0xebe126adabe1a8f08d3ce53b45e7cc994ca14070",
    capitalSnapshot: {
      valueUsd: 26809973.261703998,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Leo",
    address: "0xa445a0a15b1d50fa0c4bfe6796d9447e0da5329d",
    capitalSnapshot: {
      valueUsd: 12464843.807883,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Daniel",
    address: "0x03b9a189e2480d1e4c3007080b29f362282130fa",
    capitalSnapshot: {
      valueUsd: 58418993.526080996,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Tristan",
    address: "0xdf954bbe619273a56e0cfa90dad8382195dc7d72",
    capitalSnapshot: {
      valueUsd: 64354925.038141996,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Hugo",
    address: "0x92cbb22a9b9fc01da9914c9b39ed904dd61b859c",
    capitalSnapshot: {
      valueUsd: 13907460.715135,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Joshua",
    address: "0x0cc159b29f45c9cc0da41326d7e18e04245bc7cb",
    capitalSnapshot: {
      valueUsd: 10869247.353349,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Stephen",
    address: "0xda3768e9299e1fd81708ec030dac5ea37125f7b5",
    capitalSnapshot: {
      valueUsd: 20291240.613762002,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Adrian",
    address: "0x64a4fbb71858f681f3fa10a42b34180a9a48088d",
    capitalSnapshot: {
      valueUsd: 17304406.472382,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Dominic",
    address: "0x77eeda199553e33b246e4b4666849b9ad0972902",
    capitalSnapshot: {
      valueUsd: 13197927.160354,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Ethan",
    address: "0x17c3c8fdbcb7d1b240ce08965e09b1fc91cba868",
    capitalSnapshot: {
      valueUsd: 21269502.969527,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Gavin",
    address: "0x89c645ecbd07825b194e3b98300eb3497aaba406",
    capitalSnapshot: {
      valueUsd: 13239145.769448,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Brent",
    address: "0xf02d16a272a842f8bac1d9a9e773aba1933454c6",
    capitalSnapshot: {
      valueUsd: 17743357.423407,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Raymond",
    address: "0xc8b527864ef2ad6dc49de7e99943a3a76ad48891",
    capitalSnapshot: {
      valueUsd: 14793720.337418,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Alfred",
    address: "0xec85bc052ec5b6d6cb2b40f5caa45e39b61a77fe",
    capitalSnapshot: {
      valueUsd: 11630977.375802,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Connor",
    address: "0x77375a8c9d13bf79afb2a87f1b0ac1dfd5f5bf66",
    capitalSnapshot: {
      valueUsd: 42678464.105824,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Alexander",
    address: "0x15a4f009bb324a3fb9e36137136b201e3fe0dfdb",
    capitalSnapshot: {
      valueUsd: 34968270.984698,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Mason",
    address: "0x484bc1608211d0604bf70bae72792a56884562f8",
    capitalSnapshot: {
      valueUsd: 51619193.677311,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Nolan",
    address: "0xb695651daa495f59dd2725c6fe98322d8b51a92d",
    capitalSnapshot: {
      valueUsd: 33164488.439971,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Cameron",
    address: "0xf818fa41af44a1b42ba7433f4ec472be40a2c268",
    capitalSnapshot: {
      valueUsd: 41576956.702166006,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Albert",
    address: "0xebe837cd345469cbc5d6e1fd3d15ee5079ac885f",
    capitalSnapshot: {
      valueUsd: 13271241.463371001,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Marcus",
    address: "0xab961d7c42bbcd454a54b342bd191a8f090219e6",
    capitalSnapshot: {
      valueUsd: 10016019.762316,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Austin",
    address: "0xecc846a664e910103c179827dd23fea82cfcd8ce",
    capitalSnapshot: {
      valueUsd: 47089198.677368,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "RTB 2",
    address: "0xfb941d2344b72ea9101400392b818173772d0ddf",
    capitalSnapshot: {
      valueUsd: 12043833.326363,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "meowwww",
    address: "0x4d470e0a241c3d7321b4b6c6f23f214db85bfa47",
    capitalSnapshot: {
      valueUsd: 12888825.063134,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Eric",
    address: "0x7dacca323e44f168494c779bb5e7483c468ef410",
    capitalSnapshot: {
      valueUsd: 27232726.131264,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Logan",
    address: "0x4ba3979955f52158c0e4e3378b18985475182ce2",
    capitalSnapshot: {
      valueUsd: 24533241.717745002,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Ralph",
    address: "0xc5682e404f3d68ea4b461f0a22dfe8d7155de86a",
    capitalSnapshot: {
      valueUsd: 10809296.729039,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Aaron",
    address: "0x519c721de735f7c9e6146d167852e60d60496a47",
    capitalSnapshot: {
      valueUsd: 22749055.290741,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Quentin",
    address: "0xc26cbb6483229e0d0f9a1cab675271eda535b8f4",
    capitalSnapshot: {
      valueUsd: 23935020.844332,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Timothy",
    address: "0xde8d9e530b0528ffa7b1190f862536c055dd9524",
    capitalSnapshot: {
      valueUsd: 10995404.635049,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Sean",
    address: "0xcfe2729438475c5eb9e8e6da6b314a0b9e2d8fb3",
    capitalSnapshot: {
      valueUsd: 13145063.308116,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Francis",
    address: "0x88b2448328f4335ad2a8cac06485c378ebe66fe3",
    capitalSnapshot: {
      valueUsd: 10824081.974408,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Lucas",
    address: "0x4c6d679eac539bf7c5a0b7ebd8949ae93b1e5ee9",
    capitalSnapshot: {
      valueUsd: 15779122.096556,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Roman",
    address: "0xcac19662ec88d23fa1c81ac0e8570b0cf2ff26b3",
    capitalSnapshot: {
      valueUsd: 37780526.067604996,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Joseph",
    address: "0x0ad9e656d9e6211d0ea1c5462342e1fc94cc4cbf",
    capitalSnapshot: {
      valueUsd: 10193197.996381,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Harvey",
    address: "0x8f3c142fb2126d855ad1ef6c13376c7a687d33a6",
    capitalSnapshot: {
      valueUsd: 16137466.438218,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Justin",
    address: "0x9c6a5b4662c722d2c47f43d6c9813cb080ffa4ed",
    capitalSnapshot: {
      valueUsd: 10915298.611228,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jason",
    address: "0x960b6c2c4b1498681b8422eb572a8b3a6aa3f0fc",
    capitalSnapshot: {
      valueUsd: 14871696.304724,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "William",
    address: "0x053fa362f5459cf61037d8b554b5cfb055a7a4d3",
    capitalSnapshot: {
      valueUsd: 12087380.733081,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Oscar",
    address: "0xb8ebd6ed57f4102be5b1caf60d01dd1c9f270f94",
    capitalSnapshot: {
      valueUsd: 20577628.934387,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Julian",
    address: "0x60a8c761f39696b3b419f31dcda20b405cb685f6",
    capitalSnapshot: {
      valueUsd: 12941745.995432,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Riley",
    address: "0xca4903c207a0df58bf37d4bc8bbc5210726f53c8",
    capitalSnapshot: {
      valueUsd: 14681950.170691999,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Matthew",
    address: "0x0b426cb9d1d25f011042856faf5bbbfd4da9b412",
    capitalSnapshot: {
      valueUsd: 16712977.19051,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Maxwell",
    address: "0xaf0fdd39e5d92499b0ed9f68693da99c0ec1e92e",
    capitalSnapshot: {
      valueUsd: 16403530.451495,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Victor",
    address: "0xdfd526409007db0d524a62dedaaba7706736d88e",
    capitalSnapshot: {
      valueUsd: 24213790.533920996,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Russell",
    address: "0xceec48581b3145a575508719f45da07dc57fa7ce",
    capitalSnapshot: {
      valueUsd: 14670876.932393,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Ian",
    address: "0x93ab7dbdeb996806454de19c35c8247f4b2511f8",
    capitalSnapshot: {
      valueUsd: 12642371.074869,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Nathan",
    address: "0x218a65e21eddeece7a9df38c6bbdd89f692b7da2",
    capitalSnapshot: {
      valueUsd: 13992400.190745,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Dylan",
    address: "0x33b7e8a405bfc66107726ed68019d4d10dcbf0af",
    capitalSnapshot: {
      valueUsd: 22026742.207508,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Bradley",
    address: "0xefba0f56eef05f6a7d614ce519d2e284b46d3583",
    capitalSnapshot: {
      valueUsd: 18943600.339358,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Benjamin",
    address: "0x10e14ba2d77263543be1bdb2851b0933ddf4f4bd",
    capitalSnapshot: {
      valueUsd: 14501627.135376,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Liam",
    address: "0x3dc908374e11623d8eb9f07dfc7a2e5e803a54b0",
    capitalSnapshot: {
      valueUsd: 28136248.154302,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Miles",
    address: "0xb23b360c84f33a3aac5fd5a5994f8277658e4852",
    capitalSnapshot: {
      valueUsd: 12152866.48226,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Vincent",
    address: "0xe2321c8324c1da7b3ba790627d0e4ee444188a23",
    capitalSnapshot: {
      valueUsd: 11275918.64849,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Tom Riddle",
    address: "0xd260b2216b735277da6771564a01c04856e78321",
    capitalSnapshot: {
      valueUsd: 13685052.797311,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jordan",
    address: "0x9a80d88c21be60e870d07d852390e92d09223cf2",
    capitalSnapshot: {
      valueUsd: 20574492.863653,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Graham",
    address: "0x8af700ba841f30e0a3fcb0ee4c4a9d223e1efa05",
    capitalSnapshot: {
      valueUsd: 31479604.882134,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Robert",
    address: "0x007d76eec0ba411ce873a8819df50dd443d967a0",
    capitalSnapshot: {
      valueUsd: 10345394.185648,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Christopher",
    address: "0x0b8b2560d2a5dd2af7b00e7ac05e6ba979feec31",
    capitalSnapshot: {
      valueUsd: 23700957.13909,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Boba",
    address: "0x585f4fbe2d2a889c286fa71fb81d01f30773f4b1",
    capitalSnapshot: {
      valueUsd: 12108709.482244,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Bruce",
    address: "0xf71521e7978560424ff72f4e6e1a1c0abdccdaed",
    capitalSnapshot: {
      valueUsd: 29286080.820868,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Caleb",
    address: "0x37b81ab9e3ab04b9e3738e4891621205aaa31fd5",
    capitalSnapshot: {
      valueUsd: 11730017.276752,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Simon",
    address: "0xd47587702a91731dc1089b5db0932cf820151a91",
    capitalSnapshot: {
      valueUsd: 12949887.83399,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Philip",
    address: "0xbf49647d017805fcc576ac10f33a788e636f4258",
    capitalSnapshot: {
      valueUsd: 10267048.902675,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "GordonGekkko",
    address: "0x03ef8f736498047c3349bb2c18311d1bb4a79054",
    capitalSnapshot: {
      valueUsd: 12254389.885286,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Nicholas",
    address: "0xb581d667c53fd8a50bf7ffd817be0e62daa16f4f",
    capitalSnapshot: {
      valueUsd: 10779408.436335,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Kevin",
    address: "0x9cc10bd3c7e2486c0ae4623e4f7cc3ff143fac56",
    capitalSnapshot: {
      valueUsd: 10246281.824545,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Gabriel",
    address: "0x4fd04553468610e5a88a2cffa38e057c954312da",
    capitalSnapshot: {
      valueUsd: 10115508.757976,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "David",
    address: "0x089fe537f4b2af55fa990bc64ff4125800bba4f8",
    capitalSnapshot: {
      valueUsd: 15741687.21943,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Scott",
    address: "0xcf5343ba750a6e30afbb1dadda08bc78f8c8ee11",
    capitalSnapshot: {
      valueUsd: 18710335.682397,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Peter",
    address: "0xbe19541903f64af97bcf8436f4d15bf3a56b8bd1",
    capitalSnapshot: {
      valueUsd: 25530466.769741,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Oliver",
    address: "0x462e3f2ce774b4dbba10662a2155e4823d4c820f",
    capitalSnapshot: {
      valueUsd: 10952401.595858,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Finn",
    address: "0x88560b720239179d7f3f9e49ca934a4861593d7f",
    capitalSnapshot: {
      valueUsd: 33267237.776101,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Wesley",
    address: "0xe867fbdad3291530e41530301ecb77693850c78e",
    capitalSnapshot: {
      valueUsd: 75292818.428648,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Samuel",
    address: "0x13c50dcdee4bbcba71baf578b345cdd35c7928be",
    capitalSnapshot: {
      valueUsd: 38682656.817786,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jacob",
    address: "0x2fe21fc5130e953b862d4a6048cfd016ecf3974d",
    capitalSnapshot: {
      valueUsd: 10518031.920973,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Henry",
    address: "0x156115e100141e9330620c253225cc5ee598a31a",
    capitalSnapshot: {
      valueUsd: 32861641.906155,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jake",
    address: "0x00b43bdee2d3fa676ab06739bf1d52f4bad6591e",
    capitalSnapshot: {
      valueUsd: 13179623.859103,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Patrick",
    address: "0xbdfa4f4492dd7b7cf211209c4791af8d52bf5c50",
    capitalSnapshot: {
      valueUsd: 64409007.207857996,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Arthur",
    address: "0x6555e1cc97d3cba6eaddebbcd7ca51d75771e0b8",
    capitalSnapshot: {
      valueUsd: 26219173.977378,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Isaac",
    address: "0x4cbd339d9969bf8558af38af46bfd299a80b315f",
    capitalSnapshot: {
      valueUsd: 14734371.822662,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Noah",
    address: "0x45d26f28196d226497130c4bac709d808fed4029",
    capitalSnapshot: {
      valueUsd: 53505319.317014,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Louis",
    address: "0xa9ff08af55b24bb5d064d776a078e8a292b8dfe2",
    capitalSnapshot: {
      valueUsd: 11585076.022336,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Brandon",
    address: "0xf02021e26e0bbfef8ffa2cc9cb64305a8ae465b4",
    capitalSnapshot: {
      valueUsd: 33943376.803433,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "ricecooker",
    address: "0xa906355beaf1d69a5fe73ce55899c49c6e67916c",
    capitalSnapshot: {
      valueUsd: 18439862.593012,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "James",
    address: "0x057e4ef25b051110f91102d71ae9fecb2e913220",
    capitalSnapshot: {
      valueUsd: 10957989.750886,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Mark",
    address: "0xad59ed47c226987cf458a63428ca10887773ba81",
    capitalSnapshot: {
      valueUsd: 11483207.139616,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Brian",
    address: "0xf605cd3adabbc3110bc3efb85ebe7be57590a527",
    capitalSnapshot: {
      valueUsd: 34752199.06142,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Thomas",
    address: "0x558072bed86151b5f992144785e4c4f8059f9c55",
    capitalSnapshot: {
      valueUsd: 11829450.910689002,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Kyle",
    address: "0xa1830e8d9f019feb448478a171bb37cc6c4c0482",
    capitalSnapshot: {
      valueUsd: 11847227.326204,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Christian",
    address: "0x6e93ebc8302890ff1d1befd779d1db131ef30d4d",
    capitalSnapshot: {
      valueUsd: 12231773.948348,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Leon",
    address: "0xa9b95f2a2e7ef219021efc5c04c32761b8553bbd",
    capitalSnapshot: {
      valueUsd: 23972371.213756,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Jonathan",
    address: "0x9a1500b41519868039b1f95c447ba50b76d837e6",
    capitalSnapshot: {
      valueUsd: 10911724.883923,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "LESTER",
    address: "0x82b02bd42b8a837228181ea34bf0679a51a37e39",
    capitalSnapshot: {
      valueUsd: 10625351.732359,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Ryan",
    address: "0x2ea6bbf8eaf9f73589c347067c7c43ff637b6fc5",
    capitalSnapshot: {
      valueUsd: 10222940.983923,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
  {
    name: "Carl",
    address: "0xf961e5e6c5276164adb2865b7e80cf82dc04e920",
    capitalSnapshot: {
      valueUsd: 11808919.440971,
      asOf: "2026-11-19T09:57:04Z",
    },
  },
];
