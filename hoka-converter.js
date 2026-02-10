// HOKA Converter Logic - WITH HARDCODED HANDLES + UNIFIED FORMAT
const HokaConverter = {
    inventoryData: [],
    brandName: 'hoka',

    // ========== HOKA EXISTING HANDLES ==========
    // Key format: "styleNumber-colorCode" (e.g., "1162030-BBLC")
    // Value: existing Shopify handle to preserve SEO
    existingHandles: {
        '1123074-ADW': 'men-s-solimar-asteroid-white',
        '1123074-BWHT': 'solimar-black-white',
        '1123074-FTW': 'men-s-solimar-foggy-night-white',
        '1123074-WWH': 'solimar-white-white',
        '1123075-BBLC': 'solimar-black-black',
        '1123075-BWHT': 'solimar-black-white',
        '1123075-CYTN': 'women-s-solimar-cosmic-grey-tangerine-glow',
        '1123075-GRTC': 'women-s-solimar-grout-cerise',
        '1123075-WWH': 'solimar-white-white',
        '1123153-ARV': 'men-s-transport-alabaster-varsity-navy',
        '1123153-DEGG': 'men-s-transport-dune-eggnog',
        '1123153-MPLG': 'men-s-transport-maple-grassland',
        '1123153-SSSC': 'men-s-transport-sea-moss-eucalyptus',
        '1123153-TSLT': 'men-s-transport-truffle-salt-truffle-salt',
        '1123153-VYN': 'men-s-transport-varsity-navy-white',
        '1123153-WWH': 'men-s-transport-white-white',
        '1123154-CMCP': 'women-s-transport-cosmic-pearl-oat-milk',
        '1123154-CRYS': 'women-s-transport-cosmic-grey-silver',
        '1123154-DTD': 'women-s-transport-droplet-droplet',
        '1123154-EEGG': 'women-s-transport-eggnog-eggnog-extra',
        '1123154-JDY': 'women-s-transport-jade-oyster-mushroom',
        '1123154-RLTT': 'women-s-transport-rose-latte-rose-cream',
        '1123154-SQD': 'women-s-transport-squid-ink-sea-glass',
        '1123154-STZ': 'women-s-transport-smoky-quartz-oat-milk',
        '1127929-BBLC': 'men-s-gaviota-5-black-black',
        '1127929-BHFG': 'men-s-gaviota-5-birch-foggy-night',
        '1127929-BTRC': 'men-s-gaviota-5-black-electric-cobalt',
        '1127929-BWHT': 'gaviota-5-black-white',
        '1127929-BYT': 'men-s-gaviota-5-barley-oat-milk',
        '1127929-DHN': 'gaviota-5-downpour-thunder-cloud',
        '1127929-DLSH': 'men-s-gaviota-5-deep-lagoon-sherbet',
        '1127929-FTG': 'men-s-gaviota-5-frost-gold',
        '1127929-LDVB': 'gaviota-5-limestone-diva-blue',
        '1127929-ORF': 'men-s-gaviota-5-oyster-mushroom-truffle-salt',
        '1127929-SSK': 'men-s-gaviota-5-shadow-dusk',
        '1127929-VYN': 'men-s-gaviota-5-varsity-navy-white',
        '1133957F-BLCKB': 'men-s-transport-gtx-black-black',
        '1133957F-DZYB': 'men-s-transport-gtx-druzy-birch',
        '1133957F-EGH': 'men-s-transport-gtx-eggshell-light-roast',
        '1133957F-GLCT': 'men-s-transport-gtx-galactic-grey-stardust',
        '1133957F-MFF': 'transport-gtx-midnight-blue-truffle-salt',
        '1133957F-STTM': 'men-s-transport-gtx-slate-oat-milk',
        '1133957F-WLK': 'men-s-transport-gtx-wheat-oat-milk',
        '1133958F-ASHG': 'women-s-transport-gtx-ash-grey-ash-grey',
        '1133958F-BLSHR': 'women-s-transport-gtx-blush-rose-cream',
        '1133958F-CCPR': 'women-s-transport-gtx-cosmic-pearl-cosmic-pearl',
        '1133958F-DEGG': 'women-s-transport-gtx-dune-eggnog',
        '1133958F-DZYB': 'women-s-transport-gtx-druzy-birch',
        '1133958F-FCC': 'women-s-transport-gtx-fragrant-lilac-lilac-cream',
        '1133958F-ORS': 'women-s-transport-gtx-opal-vaporous',
        '1134234-BWHT': 'gaviota-5-black-white',
        '1134234-DHN': 'gaviota-5-downpour-thunder-cloud',
        '1134234-LDVB': 'gaviota-5-limestone-diva-blue',
        '1134234-VYN': 'men-s-gaviota-5-varsity-navy-white',
        '1134235-ALJ': 'women-s-gaviota-5-alpine-blue-jadeite',
        '1134235-ARP': 'gaviota-5-anchor-grapefruit',
        '1134235-BWHT': 'gaviota-5-black-white',
        '1134235-SWML': 'women-s-gaviota-5-snow-melt-cielo-blue',
        '1134270-BWHT': 'gaviota-5-black-white',
        '1134270-HMRG': 'gaviota-5-harbor-mist-rose-gold',
        '1147790-AFF': 'men-s-mach-6-antique-olive-truffle-salt',
        '1147790-BNGH': 'men-s-mach-6-black-night-sky',
        '1147790-BWHT': 'mach-6-black-white',
        '1147790-CLRSS': 'men-s-mach-6-clear-sea-sea-water',
        '1147790-DDW': 'men-s-mach-6-dusk-shadow',
        '1147790-FTST': 'men-s-mach-6-frost-starlight-glow',
        '1147790-GPH': 'men-s-mach-6-gravel-asphalt-grey',
        '1147790-SNTF': 'men-s-mach-6-succulent-fern',
        '1147790-VLD': 'men-s-mach-6-varsity-navy-nautical-dusk',
        '1147790-WKY': 'men-s-mach-6-white-skyward-blue',
        '1147790-WNL': 'men-s-mach-6-white-neon-lime',
        '1147791-CDN': 'speedgoat-6-charcoal-grey-midnight-blue',
        '1147791-DRPL': 'men-s-speedgoat-6-droplet-nautical-dusk',
        '1147791-MPLC': 'men-s-speedgoat-6-maple-cardamom',
        '1147791-OSH': 'men-s-speedgoat-6-oyster-mushroom-wild-mushroom',
        '1147791-PTYB': 'speedgoat-6-putty-blue-twilight',
        '1147791-WNG': 'men-s-speedgoat-6-white-neon-tangerine',
        '1147810-BWHT': 'women-s-mach-6-black-white',
        '1147810-CSSW': 'women-s-mach-6-cloudless-waterpark',
        '1147810-GHR': 'women-s-mach-6-grey-skies-charcoal-grey',
        '1147810-JTL': 'women-s-mach-6-jadeite-alpine-blue',
        '1147810-ORF': 'women-s-mach-6-oyster-mushroom-truffle-salt',
        '1147810-RSLT': 'mach-6-rose-latte-blush',
        '1147810-TNDR': 'mach-6-tundra-blue-raindrop',
        '1147810-VLD': 'women-s-mach-6-varsity-navy-nautical-dusk',
        '1147810-WNH': 'women-s-mach-6-white-neon-hoka-citrus',
        '1147810-WTCL': 'women-s-mach-6-white-cielo-blue',
        '1147811-BNNH': 'women-s-speedgoat-6-black-neon-hoka-citrus',
        '1147811-CYLB': 'women-s-speedgoat-6-cosmic-grey-alabaster',
        '1147811-FDS': 'women-s-speedgoat-6-feldspar-blue-twilight',
        '1147811-GKS': 'women-s-speedgoat-6-gull-stormy-skies',
        '1147811-GMC': 'speedgoat-6-grey-skies-cosmic-grey',
        '1147811-MNLG': 'women-s-speedgoat-6-moonlight-thunder-cloud',
        '1147811-NDS': 'speedgoat-6-nautical-dusk-sea-ice',
        '1147811-RLCK': 'women-s-speedgoat-6-rouge-black-cherry',
        '1147811-RSLT': 'women-s-speedgoat-6-rose-latte-blush',
        '1147811-SLWS': 'women-s-speedgoat-6-starlight-glow-aster-flower',
        '1147811-SYST': 'speedgoat-6-stellar-grey-asteroid',
        '1147811-WNG': 'women-s-speedgoat-6-white-neon-tangerine',
        '1147830-CDN': 'speedgoat-6-charcoal-grey-midnight-blue',
        '1147830-GCG': 'speedgoat-6-galactic-grey-hoka-blue',
        '1147830-PTYB': 'speedgoat-6-putty-blue-twilight',
        '1147832-GMC': 'speedgoat-6-grey-skies-cosmic-grey',
        '1147832-MNLG': 'women-s-speedgoat-6-moonlight-thunder-cloud',
        '1147832-SYST': 'speedgoat-6-stellar-grey-asteroid',
        '1147833-AFF': 'men-s-mach-6-antique-olive-truffle-salt',
        '1147833-BNGH': 'men-s-mach-6-black-night-sky',
        '1147833-BWHT': 'mach-6-black-white',
        '1147834-BWHT': 'women-s-mach-6-black-white',
        '1147834-FTRS': 'women-s-mach-6-frost-rose-gold',
        '1147834-JTL': 'women-s-mach-6-jadeite-alpine-blue',
        '1147834-PLDS': 'women-s-mach-6-pale-dusk-gull',
        '1147834-RSLT': 'mach-6-rose-latte-blush',
        '1147834-TNDR': 'mach-6-tundra-blue-raindrop',
        '1147911-BVR': 'men-s-skyward-x-blanc-de-blanc-virtual-blue',
        '1147911-CRYS': 'men-s-skyward-x-cosmic-grey-silver',
        '1147911-CSLP': 'men-s-skyward-x-clear-sea-alpine-blue',
        '1147911-FLP': 'men-s-skyward-x-frost-lupine',
        '1147911-LCC': 'men-s-skyward-x-lettuce-cloudless',
        '1147911-LMTH': 'men-s-skyward-x-luna-moth-black',
        '1147912-BSW': 'women-s-skyward-x-blanc-de-blanc-swim-day',
        '1147912-CYRS': 'women-s-skyward-x-cosmic-grey-rose-gold',
        '1147912-JTD': 'skyward-x-jadeite-dried-rose',
        '1147912-MSP': 'women-s-skyward-x-mint-fluorite-blue-spark',
        '1152450-BBLC': 'men-s-transport-black-black',
        '1152450-WWH': 'men-s-transport-white-white',
        '1155111-BHLB': 'men-s-skyflow-birch-alabaster',
        '1155111-BWHT': 'men-s-skyflow-black-white',
        '1155111-DHN': 'men-s-skyflow-downpour-thunder-cloud',
        '1155111-DRZY': 'men-s-skyflow-druzy-droplet',
        '1155111-FCG': 'men-s-skyflow-frost-cosmic-grey',
        '1155111-FSTS': 'men-s-skyflow-frost-solar-flare',
        '1155111-FTG': 'men-s-skyflow-frost-gold',
        '1155111-HLF': 'men-s-skyflow-hoka-blue-frost',
        '1155111-LHW': 'men-s-skyflow-luna-moth-white',
        '1155111-MLNG': 'men-s-skyflow-midnight-blue-night-sky',
        '1155111-MVR': 'men-s-skyflow-midnight-blue-varsity-navy',
        '1155111-NRS': 'men-s-skyflow-neon-hoka-citrus-neon-white',
        '1155111-SRYS': 'men-s-skyflow-stellar-grey-shoreline',
        '1155111-STLLR': 'men-s-skyflow-stellar-grey-stardust',
        '1155111-SYZ': 'men-s-skyflow-sunlight-neon-yuzu',
        '1155111-VVY': 'men-s-skyflow-varsity-navy-electric-cobalt',
        '1155111-WSHR': 'men-s-skyflow-wild-mushroom-grassland',
        '1155113-ARVN': 'women-s-skyflow-alabaster-vintage-green',
        '1155113-ATRM': 'women-s-skyflow-alabaster-mineral-blue',
        '1155113-BWHT': 'women-s-skyflow-black-white',
        '1155113-CMCG': 'women-s-skyflow-cosmic-grey-seafoam',
        '1155113-FCG': 'women-s-skyflow-frost-cosmic-grey',
        '1155113-FTRS': 'women-s-skyflow-frost-rose-gold',
        '1155113-LHW': 'women-s-skyflow-luna-moth-white',
        '1155113-MTW': 'women-s-skyflow-midnight-pink-twilight',
        '1155113-NKN': 'women-s-skyflow-nautical-dusk-anchor',
        '1155113-RCRM': 'women-s-skyflow-rose-cream-alabaster',
        '1155113-RRMR': 'women-s-skyflow-rose-cream-rose-latte',
        '1155113-SLWC': 'women-s-skyflow-starlight-glow-carnation',
        '1155113-SYZ': 'women-s-skyflow-sunlight-neon-yuzu',
        '1155113-UNN': 'women-s-skyflow-ultramarine-night-sky',
        '1155117-BWHT': 'men-s-skyflow-black-white',
        '1155117-DHN': 'men-s-skyflow-downpour-thunder-cloud',
        '1155117-DRZY': 'men-s-skyflow-druzy-droplet',
        '1155117-MVR': 'men-s-skyflow-midnight-blue-varsity-navy',
        '1155117-VVY': 'men-s-skyflow-varsity-navy-electric-cobalt',
        '1155117-WSHR': 'men-s-skyflow-wild-mushroom-grassland',
        '1155118-ARVN': 'women-s-skyflow-alabaster-vintage-green',
        '1155118-ATRM': 'women-s-skyflow-alabaster-mineral-blue',
        '1155118-BWHT': 'women-s-skyflow-black-white',
        '1155118-NKN': 'women-s-skyflow-nautical-dusk-anchor',
        '1155118-RRMR': 'women-s-skyflow-rose-cream-rose-latte',
        '1155118-SLWC': 'women-s-skyflow-starlight-glow-carnation',
        '1155119-BCQ': 'men-s-mach-x-3-black-electric-aqua',
        '1155119-FCT': 'men-s-mach-x-3-frost-citrus',
        '1155120-FCQ': 'women-s-mach-x-3-frost-electric-aqua',
        '1155150-BCKT': 'men-s-speedgoat-6-black-outer-orbit',
        '1155150-BZY': 'men-s-speedgoat-6-blue-twilight-druzy',
        '1155150-FYNG': 'men-s-speedgoat-6-foggy-night-charcoal-grey',
        '1155150-SFRN': 'men-s-speedgoat-6-sea-glass-fern',
        '1155150-STLV': 'men-s-speedgoat-6-slate-aloe-vera',
        '1155150-WLSP': 'men-s-speedgoat-6-washed-blue-asphalt-grey',
        '1155151-BCKT': 'women-s-speedgoat-6-black-outer-orbit',
        '1155151-FMB': 'women-s-speedgoat-6-fragrant-lilac-ambient-blue',
        '1155151-JSH': 'women-s-speedgoat-6-jade-ash-grey',
        '1155151-MLLP': 'speedgoat-6-midnight-blue-alpine-blue',
        '1155151-SZQ': 'women-s-speedgoat-6-smoky-quartz-quartzite',
        '1155151-TFL': 'women-s-speedgoat-6-thunder-cloud-mint-fluorite',
        '1155152-OTC': 'men-s-speedgoat-6-outer-orbit-lettuce',
        '1155152-SLTG': 'men-s-speedgoat-6-satellite-grey-stardust',
        '1155152-SMLK': 'men-s-speedgoat-6-sea-moss-oat-milk',
        '1155152-TRFF': 'men-s-speedgoat-6-truffle-salt-cement',
        '1155153-ADC': 'women-s-speedgoat-6-asteroid-cosmic-grey',
        '1155153-AYC': 'women-s-speedgoat-6-ash-grey-charcoal-grey',
        '1155153-GGV': 'women-s-speedgoat-6-galaxy-guava',
        '1155153-MFGD': 'women-s-speedgoat-6-mountain-fog-droplet',
        '1155190-BKLB': 'men-s-transport-chukka-black-alabaster',
        '1155191-CMCP': 'women-s-transport-chukka-cosmic-pearl-oat-milk',
        '1155191-OST': 'women-s-transport-chukka-oat-milk-alabaster',
        '1155770-BCKT': 'men-s-speedgoat-6-black-outer-orbit',
        '1155771-BCKT': 'women-s-speedgoat-6-black-outer-orbit',
        '1162011-ADSL': 'men-s-bondi-9-asteroid-silver',
        '1162011-ALTG': 'men-s-bondi-9-asphalt-grey-gravel',
        '1162011-BBLC': 'men-s-bondi-9-black-black',
        '1162011-BKVR': 'men-s-bondi-9-black-vermillion',
        '1162011-BWHT': 'men-s-bondi-9-black-white',
        '1162011-CYLT': 'men-s-bondi-9-cosmic-grey-ultramarine',
        '1162011-DNP': 'men-s-bondi-9-drizzle-downpour',
        '1162011-GCTC': 'men-s-bondi-9-galactic-grey-stellar-grey',
        '1162011-GSSL': 'men-s-bondi-9-grassland-oyster-mushroom',
        '1162011-LNMT': 'men-s-bondi-9-luna-moth-blue-spark',
        '1162011-MVR': 'men-s-bondi-9-midnight-blue-varsity-navy',
        '1162011-NYZS': 'men-s-bondi-9-neon-yuzu-sunlight',
        '1162011-OLTM': 'men-s-bondi-9-oatmeal-oat-milk',
        '1162011-SCCG': 'men-s-bondi-9-stucco-grout',
        '1162011-SNTF': 'men-s-bondi-9-succulent-fern',
        '1162011-SSTC': 'men-s-bondi-9-stardust-cosmic-grey',
        '1162011-TDRC': 'men-s-bondi-9-thunder-cloud-vermillion',
        '1162011-VYN': 'men-s-bondi-9-varsity-navy-white',
        '1162011-WKB': 'men-s-bondi-9-white-hoka-blue',
        '1162011-WWH': 'men-s-bondi-9-white-white',
        '1162012-AGH': 'women-s-bondi-9-aster-flower-starlight-glow',
        '1162012-ALBST': 'women-s-bondi-9-alabaster-birch',
        '1162012-BBLC': 'women-s-bondi-9-black-black',
        '1162012-BRGL': 'women-s-bondi-9-black-rose-gold',
        '1162012-BTF': 'women-s-bondi-9-blue-spark-mint-fluorite',
        '1162012-BWHT': 'women-s-bondi-9-black-white',
        '1162012-CRDS': 'women-s-bondi-9-cosmic-grey-stardust',
        '1162012-CYWH': 'women-s-bondi-9-cosmic-grey-white',
        '1162012-FTCL': 'women-s-bondi-9-frost-cielo-blue',
        '1162012-LYC': 'women-s-bondi-9-lingonberry-cranberry',
        '1162012-MBLW': 'women-s-bondi-9-mineral-blue-washed-blue',
        '1162012-NYZS': 'women-s-bondi-9-neon-yuzu-sunlight',
        '1162012-OSG': 'women-s-bondi-9-oat-milk-rose-gold',
        '1162012-RLTT': 'women-s-bondi-9-rose-latte-rose-cream',
        '1162012-RSTP': 'women-s-bondi-9-rose-tea-petal',
        '1162012-SDSTS': 'women-s-bondi-9-stardust-silver',
        '1162012-SNNF': 'women-s-bondi-9-skyward-blue-neon-fuchsia',
        '1162012-TLSL': 'women-s-bondi-9-truffle-salt-sea-glass',
        '1162012-VCH': 'women-s-bondi-9-vanilla-birch',
        '1162012-WWH': 'women-s-bondi-9-white-white',
        '1162013-BBLC': 'men-s-bondi-9-black-black',
        '1162013-BWHT': 'men-s-bondi-9-black-white',
        '1162013-CYLT': 'men-s-bondi-9-cosmic-grey-ultramarine',
        '1162013-GCTC': 'men-s-bondi-9-galactic-grey-stellar-grey',
        '1162013-GSSL': 'men-s-bondi-9-grassland-oyster-mushroom',
        '1162013-MVR': 'men-s-bondi-9-midnight-blue-varsity-navy',
        '1162013-SCCG': 'men-s-bondi-9-stucco-grout',
        '1162013-SLHK': 'men-s-bondi-9-skyward-blue-hoka-blue',
        '1162013-TDRC': 'men-s-bondi-9-thunder-cloud-vermillion',
        '1162013-VYN': 'men-s-bondi-9-varsity-navy-white',
        '1162014-ALBST': 'women-s-bondi-9-alabaster-birch',
        '1162014-BBLC': 'women-s-bondi-9-black-black',
        '1162014-BTF': 'women-s-bondi-9-blue-spark-mint-fluorite',
        '1162014-BWHT': 'women-s-bondi-9-black-white',
        '1162014-CYWH': 'women-s-bondi-9-cosmic-grey-white',
        '1162014-MBLW': 'women-s-bondi-9-mineral-blue-washed-blue',
        '1162014-RLTT': 'women-s-bondi-9-rose-latte-rose-cream',
        '1162014-RSTP': 'women-s-bondi-9-rose-tea-petal',
        '1162014-SDSTS': 'women-s-bondi-9-stardust-silver',
        '1162014-TLSL': 'women-s-bondi-9-truffle-salt-sea-glass',
        '1162014-VCH': 'women-s-bondi-9-vanilla-birch',
        '1162014-WWH': 'women-s-bondi-9-white-white',
        '1162015-BBLC': 'men-s-bondi-9-black-black-extra',
        '1162015-BWHT': 'men-s-bondi-9-black-white-extra',
        '1162015-GCTC': 'men-s-bondi-9-galactic-grey-stellar-grey-extra',
        '1162015-VYN': 'men-s-bondi-9-varsity-navy-white-extra',
        '1162016-BBLC': 'women-s-bondi-9-black-black-extra',
        '1162016-BWHT': 'women-s-bondi-9-black-white-extra',
        '1162016-MBLW': 'women-s-bondi-9-mineral-blue-washed-blue-extra',
        '1162016-RLTT': 'women-s-bondi-9-rose-latte-rose-cream-extra',
        '1162016-SDSTS': 'women-s-bondi-9-stardust-silver-extra',
        '1162016-WWH': 'women-s-bondi-9-white-white-extra',
        '1162030-ADSL': 'men-s-clifton-10-asteroid-silver',
        '1162030-ALF': 'men-s-clifton-10-alpine-blue-foggy-night',
        '1162030-BBLC': 'men-s-clifton-10-black-black',
        '1162030-BKSV': 'men-s-clifton-10-black-silver',
        '1162030-BWHT': 'men-s-clifton-10-black-white',
        '1162030-FFF': 'men-s-clifton-10-fern-truffle-salt',
        '1162030-GYST': 'men-s-clifton-10-galactic-grey-asteroid',
        '1162030-HSK': 'men-s-clifton-10-hoka-blue-skyward-blue',
        '1162030-NMD': 'men-s-clifton-10-night-sky-midnight-blue',
        '1162030-NSS': 'men-s-clifton-10-neon-hoka-citrus-sunlight',
        '1162030-NWT': 'men-s-clifton-10-navy-white',
        '1162030-OLTM': 'men-s-clifton-10-oatmeal-oat-milk',
        '1162030-PTYG': 'men-s-clifton-10-putty-grout',
        '1162030-RNN': 'men-s-clifton-10-raw-linen-stone',
        '1162030-SGNN': 'men-s-clifton-10-sage-neon-flame',
        '1162030-STLLR': 'men-s-clifton-10-stellar-grey-stardust',
        '1162030-VLLN': 'men-s-clifton-10-vermillion-varsity-navy',
        '1162030-WKY': 'men-s-clifton-10-white-skyward-blue',
        '1162030-WWH': 'men-s-clifton-10-white-white',
        '1162031-ARRS': 'women-s-clifton-10-alabaster-rose-gold',
        '1162031-BBLC': 'women-s-clifton-10-black-black',
        '1162031-BHLB': 'women-s-clifton-10-birch-alabaster',
        '1162031-BHRS': 'women-s-clifton-10-blush-rose-latte',
        '1162031-BKGD': 'women-s-clifton-10-black-gold',
        '1162031-BRGL': 'women-s-clifton-10-black-rose-gold',
        '1162031-BWHT': 'women-s-clifton-10-black-white',
        '1162031-CRDS': 'women-s-clifton-10-cosmic-grey-stardust',
        '1162031-CTNS': 'women-s-clifton-10-carnation-starlight-glow',
        '1162031-DTDR': 'women-s-clifton-10-droplet-druzy',
        '1162031-GRTM': 'women-s-clifton-10-grout-mineral-blue',
        '1162031-NYL': 'women-s-clifton-10-night-sky-ultramarine',
        '1162031-OTP': 'women-s-clifton-10-overcast-petal',
        '1162031-RMD': 'women-s-clifton-10-rose-cream-dried-rose',
        '1162031-SBLF': 'women-s-clifton-10-soaring-blue-frost',
        '1162031-SJD': 'women-s-clifton-10-sea-glass-jadeite',
        '1162031-SKYW': 'women-s-clifton-10-skyward-blue-cielo-blue',
        '1162031-SLSSN': 'women-s-clifton-10-sea-glass-neon-flame',
        '1162031-SRYG': 'women-s-clifton-10-stellar-grey-galactic-grey',
        '1162031-VCH': 'women-s-clifton-10-vanilla-birch',
        '1162031-WTLC': 'women-s-clifton-10-white-electric-rose',
        '1162031-WWH': 'women-s-clifton-10-white-white',
        '1162032-ALF': 'men-s-clifton-10-alpine-blue-foggy-night',
        '1162032-BBLC': 'men-s-clifton-10-black-black',
        '1162032-BKSV': 'men-s-clifton-10-black-silver',
        '1162032-BWHT': 'men-s-clifton-10-black-white',
        '1162032-GYST': 'men-s-clifton-10-galactic-grey-asteroid',
        '1162032-HSK': 'men-s-clifton-10-hoka-blue-skyward-blue',
        '1162032-NMD': 'men-s-clifton-10-night-sky-midnight-blue',
        '1162032-NWT': 'men-s-clifton-10-navy-white',
        '1162032-PTYG': 'men-s-clifton-10-putty-grout',
        '1162032-RNN': 'men-s-clifton-10-raw-linen-stone',
        '1162032-STLLR': 'men-s-clifton-10-stellar-grey-stardust',
        '1162032-VLLN': 'men-s-clifton-10-vermillion-varsity-navy',
        '1162032-WKY': 'men-s-clifton-10-white-skyward-blue',
        '1162032-WWH': 'men-s-clifton-10-white-white',
        '1162050-BBLC': 'women-s-clifton-10-black-black',
        '1162050-BHLB': 'women-s-clifton-10-birch-alabaster',
        '1162050-BHRS': 'women-s-clifton-10-blush-rose-latte',
        '1162050-BWHT': 'women-s-clifton-10-black-white',
        '1162050-CRDS': 'women-s-clifton-10-cosmic-grey-stardust',
        '1162050-CTNS': 'women-s-clifton-10-carnation-starlight-glow',
        '1162050-GRTM': 'women-s-clifton-10-grout-mineral-blue',
        '1162050-NYL': 'women-s-clifton-10-night-sky-ultramarine',
        '1162050-OTP': 'women-s-clifton-10-overcast-petal',
        '1162050-RMD': 'women-s-clifton-10-rose-cream-dried-rose',
        '1162050-SLSSN': 'women-s-clifton-10-sea-glass-neon-flame',
        '1162050-SRYG': 'women-s-clifton-10-stellar-grey-galactic-grey',
        '1162050-VCH': 'women-s-clifton-10-vanilla-birch',
        '1162050-WTCL': 'women-s-clifton-10-white-cielo-blue',
        '1162050-WWH': 'women-s-clifton-10-white-white',
        '1162051-BBLC': 'men-s-clifton-10-black-black-extra',
        '1162051-BWHT': 'men-s-clifton-10-black-white-extra',
        '1162051-NWT': 'men-s-clifton-10-navy-white-extra',
        '1162051-PTYG': 'men-s-clifton-10-putty-grout-extra',
        '1162051-STLLR': 'men-s-clifton-10-stellar-grey-stardust-extra',
        '1162052-BBLC': 'women-s-clifton-10-black-black-extra',
        '1162052-BWHT': 'women-s-clifton-10-black-white-extra',
        '1162052-GRTM': 'women-s-clifton-10-grout-mineral-blue-extra',
        '1162052-WWH': 'women-s-clifton-10-white-white-extra',
        '1164371-EEGG': 'women-s-transport-eggnog-eggnog',
        '1168690-ADSL': 'men-s-arahi-8-asteroid-silver',
        '1168690-ALBST': 'men-s-arahi-8-alabaster-birch',
        '1168690-BBLC': 'men-s-arahi-8-black-black',
        '1168690-BKSK': 'men-s-arahi-8-black-skyward-blue',
        '1168690-BWHT': 'men-s-arahi-8-black-white',
        '1168690-GTP': 'men-s-arahi-8-grout-putty',
        '1168690-NZN': 'men-s-arahi-8-neon-yuzu-neon-flame',
        '1168690-SSTC': 'men-s-arahi-8-stardust-cosmic-grey',
        '1168690-TDRC': 'men-s-arahi-8-thunder-cloud-vermillion',
        '1168690-TYS': 'men-s-arahi-8-truffle-salt-oyster-mushroom',
        '1168690-VYN': 'men-s-arahi-8-varsity-navy-white',
        '1168690-WWH': 'men-s-arahi-8-white-white',
        '1168691-ARLN': 'women-s-arahi-8-alabaster-lingonberry',
        '1168691-ARRS': 'women-s-arahi-8-alabaster-rose-gold',
        '1168691-BBLC': 'women-s-arahi-8-black-black',
        '1168691-BHLB': 'women-s-arahi-8-birch-alabaster',
        '1168691-BHRS': 'women-s-arahi-8-blush-rose-latte',
        '1168691-BRGL': 'women-s-arahi-8-black-rose-gold',
        '1168691-BWHT': 'women-s-arahi-8-black-white',
        '1168691-CYG': 'women-s-arahi-8-charcoal-grey-grey-skies',
        '1168691-DZLP': 'women-s-arahi-8-drizzle-petal',
        '1168691-MLLT': 'women-s-arahi-8-midnight-blue-ultramarine',
        '1168691-ORF': 'arahi-8-oyster-mushroom-truffle-salt',
        '1168691-RCRM': 'women-s-arahi-8-rose-cream-alabaster',
        '1168691-SYZ': 'women-s-arahi-8-sunlight-neon-yuzu',
        '1168691-WWH': 'women-s-arahi-8-white-white',
        '1168710-BBLC': 'men-s-arahi-8-black-black',
        '1168710-BKSK': 'men-s-arahi-8-black-skyward-blue',
        '1168710-BWHT': 'men-s-arahi-8-black-white',
        '1168710-GTP': 'men-s-arahi-8-grout-putty',
        '1168710-SSTC': 'men-s-arahi-8-stardust-cosmic-grey',
        '1168710-VYN': 'men-s-arahi-8-varsity-navy-white',
        '1168711-BBLC': 'women-s-arahi-8-black-black',
        '1168711-BHLB': 'women-s-arahi-8-birch-alabaster',
        '1168711-BRGL': 'women-s-arahi-8-black-rose-gold',
        '1168711-BWHT': 'women-s-arahi-8-black-white',
        '1168711-RCRM': 'women-s-arahi-8-rose-cream-alabaster',
        '1168711-WWH': 'women-s-arahi-8-white-white',
        '1168720-NNHK': 'mach-x-3-neon-hoka-citrus-neon-lime',
        '1168720-NZS': 'men-s-mach-x-3-neon-yuzu-squid-ink',
        '1168720-WBS': 'men-s-mach-x-3-white-alabaster',
        '1168720-WNG': 'men-s-mach-x-3-white-neon-tangerine',
        '1168721-NNRS': 'women-s-mach-x-3-neon-rose-neon-tangerine',
        '1168721-NZS': 'women-s-mach-x-3-neon-yuzu-squid-ink',
        '1168721-WBS': 'women-s-mach-x-3-white-alabaster',
        '1168721-WNL': 'women-s-mach-x-3-white-neon-lime',
        '1169450-BBLC': 'men-s-transport-gtx-black-black',
        '1169451-DEGG': 'women-s-transport-gtx-dune-eggnog',
        '1171850-ABST': 'women-s-transport-alabaster-alabaster',
        '1171850-BBLC': 'women-s-transport-black-black',
        '1171850-BKLB': 'women-s-transport-black-alabaster',
        '1171850-SSTSG': 'women-s-transport-stardust-sea-glass',
        '1171850-TNQ': 'women-s-transport-tranquil-blue-ambient-blue',
        '1171850-WWH': 'women-s-transport-white-white',
        '1171851-ABST': 'men-s-transport-alabaster-alabaster',
        '1171851-BBLC': 'men-s-transport-black-black',
        '1171851-BKLB': 'men-s-transport-black-alabaster',
        '1171851-CMVN': 'men-s-transport-cream-vintage-yellow',
        '1171851-FYM': 'men-s-transport-faded-navy-mineral-blue',
        '1171851-GLST': 'men-s-transport-gravel-stucco',
        '1171852-ABST': 'men-s-solimar-alabaster-alabaster',
        '1171852-BBLC': 'men-s-solimar-black-black',
        '1171852-BWHT': 'men-s-solimar-black-white',
        '1171852-MGRT': 'men-s-solimar-midnight-blue-grout',
        '1171852-STBY': 'men-s-solimar-stardust-bay-leaf',
        '1171853-ABST': 'women-s-solimar-alabaster-alabaster',
        '1171853-BBLC': 'women-s-solimar-black-black',
        '1171853-BWHT': 'women-s-solimar-black-white',
        '1171853-CBRR': 'women-s-solimar-cosmic-grey-berry-patch',
        '1171853-FTMN': 'women-s-solimar-frost-mineral-blue',
        '1171928-BWHT': 'men-s-speedgoat-7-black-white',
        '1171928-KWN': 'men-s-speedgoat-7-kiwi-neon-yuzu',
        '1171928-VMR': 'men-s-speedgoat-7-vintage-yellow-turmeric',
        '1171929-BWHT': 'women-s-speedgoat-7-black-white',
        '1171929-PYZ': 'women-s-speedgoat-7-persimmon-neon-yuzu',
        '1171929-VWN': 'women-s-speedgoat-7-vintage-yellow-neon-flame',
        '1171930-BWHT': 'men-s-speedgoat-7-black-white',
        '1171931-BWHT': 'women-s-speedgoat-7-black-white',
        '1171931-VWN': 'women-s-speedgoat-7-vintage-yellow-neon-flame',
        '1171932-BBLC': 'men-s-gaviota-6-black-black',
        '1171932-BWHT': 'men-s-gaviota-6-black-white',
        '1171932-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy',
        '1171932-STLLR': 'men-s-gaviota-6-stellar-grey-stardust',
        '1171933-BBLC': 'women-s-gaviota-6-black-black',
        '1171933-BHY': 'women-s-gaviota-6-birch-yellow-gold',
        '1171933-BWHT': 'women-s-gaviota-6-black-white',
        '1171933-CRDS': 'women-s-gaviota-6-cosmic-grey-stardust',
        '1171933-SSSG': 'women-s-gaviota-6-sea-glass-sage',
        '1171934-BBLC': 'men-s-gaviota-6-black-black',
        '1171934-BWHT': 'men-s-gaviota-6-black-white',
        '1171934-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy',
        '1171934-STLLR': 'men-s-gaviota-6-stellar-grey-stardust',
        '1171935-BBLC': 'women-s-gaviota-6-black-black',
        '1171935-BHY': 'women-s-gaviota-6-birch-yellow-gold',
        '1171935-BWHT': 'women-s-gaviota-6-black-white',
        '1171935-CRDS': 'women-s-gaviota-6-cosmic-grey-stardust',
        '1171936-BBLC': 'men-s-gaviota-6-black-black-extra',
        '1171936-BWHT': 'men-s-gaviota-6-black-white-extra',
        '1171936-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy-extra',
        '1171936-STLLR': 'men-s-gaviota-6-stellar-grey-stardust-extra',
        '1171937-BBLC': 'women-s-gaviota-6-black-black-extra',
        '1171937-BWHT': 'women-s-gaviota-6-black-white-extra',
        '1172912-BBLC': 'men-s-transport-gtx-black-black',
        '1172912-GLF': 'men-s-transport-gtx-gravel-fern',
        '1172912-LSH': 'men-s-transport-gtx-light-roast-eggshell',
        '1172912-SRCG': 'men-s-transport-gtx-spruce-green-oyster-mushroom',
        '1172912-STBLS': 'men-s-transport-gtx-slate-blue-stucco',
        '1172912-VYT': 'men-s-transport-gtx-varsity-navy-truffle-salt',
        '1172912-WNTM': 'men-s-transport-gtx-walnut-maple',
        '1172913-BBLC': 'women-s-transport-gtx-black-black',
        '1172913-CSTC': 'women-s-transport-gtx-cement-stucco',
        '1172913-GSKS': 'women-s-transport-gtx-grey-skies-sea-glass',
        '1172913-OVN': 'women-s-transport-gtx-oyster-mushroom-vintage-yellow',
        '1172913-RSLT': 'women-s-transport-gtx-rose-latte-blush',
        '1174777-ABST': 'women-s-transport-alabaster-alabaster',
        '1174777-BBLC': 'women-s-transport-black-black',
        '1174777-BKLB': 'women-s-transport-black-alabaster',
        '1174777-SSTSG': 'women-s-transport-stardust-sea-glass',
        '1174777-WWH': 'women-s-transport-white-white',
        '1174778-ABST': 'men-s-transport-alabaster-alabaster',
        '1174778-BBLC': 'men-s-transport-black-black',
        '1174778-BKLB': 'men-s-transport-black-alabaster',
        '1174778-CMVN': 'men-s-transport-cream-vintage-yellow',
        '1174778-GLST': 'men-s-transport-gravel-stucco',
        '1175530-BBLC': 'men-s-arahi-8-black-black-extra',
        '1175530-BWHT': 'men-s-arahi-8-black-white-extra',
        '1175530-GTP': 'men-s-arahi-8-grout-putty-extra',
        '1175530-VYN': 'men-s-arahi-8-varsity-navy-white-extra',
        '1175531-BRGL': 'women-s-arahi-8-black-rose-gold-extra',
        '1175531-BWHT': 'women-s-arahi-8-black-white-extra',
        '1175531-RCRM': 'women-s-arahi-8-rose-cream-alabaster-extra',
        '1175531-WWH': 'women-s-arahi-8-white-white-extra',
        '1177330-ABST': 'men-s-solimar-alabaster-alabaster',
        '1177330-BBLC': 'men-s-solimar-black-black',
        '1177330-BWHT': 'men-s-solimar-black-white',
        '1177330-STBY': 'men-s-solimar-stardust-bay-leaf',
        '1177331-ABST': 'women-s-solimar-alabaster-alabaster',
        '1177331-BBLC': 'women-s-solimar-black-black',
        '1177331-BWHT': 'women-s-solimar-black-white'
    },

    isAvailableNow: function(availableDateStr) {
        if (!availableDateStr) return true;
        try {
            var parts = availableDateStr.toString().split('/').map(function(num) { return parseInt(num); });
            var month = parts[0];
            var day = parts[1];
            var year = parts[2];
            var availableDate = new Date(year, month - 1, day);
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            return availableDate <= today;
        } catch (e) {
            console.warn('Could not parse available date:', availableDateStr);
            return true;
        }
    },

    productInfo: {
        'Mach 6': {
            description: 'Behold the lightest, most responsive Mach to date.',
            specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' },
            category: 'neutral daily trainer'
        },
        'Mach 7': {
            description: 'The lightest, most responsive Mach yet.',
            specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' },
            category: 'neutral daily trainer'
        },
        'Mach X 3': {
            description: 'A plated daily trainer that brings the heat to speedwork.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '10.2 oz' },
            category: 'plated performance trainer'
        },
        'Skyward X': {
            description: 'Pushing soft and smooth to the extreme with a convex carbon fiber plate.',
            specs: { stack: '48/43mm', drop: '5mm', weight: '11.3 oz' },
            category: 'max cushion trainer'
        },
        'Clifton 10': {
            description: 'A trusted trainer for daily maintenance miles.',
            specs: { stack: '42/34mm', drop: '8mm', weight: '9.7 oz' },
            category: 'neutral cushioned trainer'
        },
        'Bondi 9': {
            description: 'One of the hardest working shoes in the HOKA lineup.',
            specs: { stack: '43/38mm', drop: '5mm', weight: '10.5 oz' },
            category: 'max cushion trainer'
        },
        'Arahi 8': {
            description: 'Anything but your average stability shoe with H-frame technology.',
            specs: { stack: '39/31mm', drop: '8mm', weight: '9.8 oz' },
            category: 'stability trainer'
        },
        'Skyflow': {
            description: 'Designed to elevate your daily running practice.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10 oz' },
            category: 'neutral daily trainer'
        },
        'Gaviota 5': {
            description: 'Maximum stability meets plush comfort.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' },
            category: 'max stability trainer'
        },
        'Gaviota 6': {
            description: 'Maximum stability meets plush comfort with enhanced H-Frame technology.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' },
            category: 'max stability trainer'
        },
        'Transport': {
            description: 'The perfect everyday shoe from trail to town.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '11.5 oz' },
            category: 'lifestyle/casual'
        },
        'Transport Chukka': {
            description: 'Elevated style meets everyday comfort.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12 oz' },
            category: 'lifestyle/casual'
        },
        'Transport GTX': {
            description: 'Weather-ready versatility with GORE-TEX protection.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' },
            category: 'lifestyle/casual'
        },
        'Transport Hike': {
            description: 'Trail-ready comfort with enhanced support and traction.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' },
            category: 'lifestyle/hiking'
        },
        'Transport Mid': {
            description: 'Ankle support meets everyday comfort.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' },
            category: 'lifestyle/casual'
        },
        'Solimar': {
            description: 'A lightweight, responsive trainer for faster-paced runs.',
            specs: { stack: '30/25mm', drop: '5mm', weight: '7.2 oz' },
            category: 'lightweight performance trainer'
        },
        'Speedgoat 6': {
            description: 'Trail icon with unmatched traction on technical terrain.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' },
            category: 'trail running'
        },
        'Speedgoat 7': {
            description: 'The ultimate trail shoe with enhanced traction and improved durability.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' },
            category: 'trail running'
        },
        'Speedgoat 6 GTX': {
            description: 'Waterproof trail running with GORE-TEX protection and Vibram Megagrip outsole.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '10.8 oz' },
            category: 'waterproof trail running'
        },
        'Speedgoat 6 Mid GTX': {
            description: 'Mid-cut waterproof trail shoe with ankle protection and aggressive traction.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '12.1 oz' },
            category: 'waterproof trail running'
        },
        'Bondi SR': {
            description: 'Slip-resistant version of the iconic Bondi, designed for professionals on their feet all day.',
            specs: { stack: '43/38mm', drop: '5mm', weight: '11.2 oz' },
            category: 'work/slip-resistant'
        },
        'Arahi SR': {
            description: 'Slip-resistant stability shoe for all-day comfort and support on the job.',
            specs: { stack: '39/31mm', drop: '8mm', weight: '10.5 oz' },
            category: 'work/slip-resistant'
        },
        'Challenger 8': {
            description: 'Versatile road-to-trail shoe with a responsive midsole and durable outsole.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '9.3 oz' },
            category: 'road-to-trail'
        },
        'Challenger 8 GTX': {
            description: 'Waterproof road-to-trail shoe with GORE-TEX protection.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '10.2 oz' },
            category: 'waterproof road-to-trail'
        },
        'Solimar 2': {
            description: 'Updated lightweight trainer for faster-paced runs with improved responsiveness.',
            specs: { stack: '30/25mm', drop: '5mm', weight: '7.2 oz' },
            category: 'lightweight performance trainer'
        },
        'Clifton 9 GTX': {
            description: 'Waterproof daily trainer with GORE-TEX protection and signature Clifton cushioning.',
            specs: { stack: '39/31mm', drop: '8mm', weight: '10.5 oz' },
            category: 'waterproof daily trainer'
        },
        'Stinson 7': {
            description: 'Maximum cushion trail shoe for long adventures on moderate terrain.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '11.5 oz' },
            category: 'max cushion trail'
        },
        'Mafate X': {
            description: 'Premium trail running shoe with plated midsole for aggressive terrain.',
            specs: { stack: '35/30mm', drop: '5mm', weight: '10.5 oz' },
            category: 'premium trail'
        },
        'Mafate 5': {
            description: 'Legendary trail shoe built for rugged terrain with maximum protection.',
            specs: { stack: '35/30mm', drop: '5mm', weight: '11.2 oz' },
            category: 'premium trail'
        },
        'Tecton X 3': {
            description: 'Carbon-plated trail racing shoe for competitive trail runners.',
            specs: { stack: '32/27mm', drop: '5mm', weight: '8.9 oz' },
            category: 'trail racing'
        },
        'Skyward Laceless': {
            description: 'Easy on/off max cushion shoe with laceless design and plush comfort.',
            specs: { stack: '48/43mm', drop: '5mm', weight: '11.5 oz' },
            category: 'max cushion laceless'
        },
        'Skyward X 2': {
            description: 'Next generation max cushion plated trainer with enhanced suspension system.',
            specs: { stack: '48/43mm', drop: '5mm', weight: '11.3 oz' },
            category: 'max cushion trainer'
        },
        'Transport 2': {
            description: 'Updated everyday lifestyle shoe for seamless trail-to-town transitions.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '11.5 oz' },
            category: 'lifestyle/casual'
        },
        'Transport Chukka GTX': {
            description: 'Waterproof mid-height casual shoe with GORE-TEX and HOKA cushioning.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' },
            category: 'lifestyle/casual'
        },
        'Transport Hike GTX': {
            description: 'Waterproof hiking shoe with enhanced traction and HOKA cushioning.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' },
            category: 'lifestyle/hiking'
        },
        'Cielo X1 2.0': {
            description: 'Elite carbon-plated super shoe for road racing. Second generation Cielo X1.',
            specs: { stack: '39/36mm', drop: '3mm', weight: '6.2 oz' },
            category: 'elite carbon road racer'
        },
        'Cielo X1 3.0': {
            description: 'Third generation elite carbon road racer with refined geometry.',
            specs: { stack: '39/36mm', drop: '3mm', weight: '6.2 oz' },
            category: 'elite carbon road racer'
        },
        'Cielo X MD': {
            description: 'Carbon-plated middle distance racing spike for track competition.',
            specs: { stack: '25/20mm', drop: '5mm', weight: '5.0 oz' },
            category: 'track racing spike'
        },
        'Cielo X 3 MD': {
            description: 'Third generation middle distance racing spike with carbon plate.',
            specs: { stack: '25/20mm', drop: '5mm', weight: '5.0 oz' },
            category: 'track racing spike'
        },
        'Cielo X 3 LD': {
            description: 'Third generation long distance racing spike with carbon plate.',
            specs: { stack: '25/20mm', drop: '5mm', weight: '5.2 oz' },
            category: 'track racing spike'
        },
        'Rocket X 3': {
            description: 'Carbon-plated road racing shoe for race day performance.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '7.5 oz' },
            category: 'carbon road racer'
        },
        'Zinal 3': {
            description: 'Lightweight trail racing shoe for fast and technical terrain.',
            specs: { stack: '28/24mm', drop: '4mm', weight: '8.5 oz' },
            category: 'trail racing'
        }
    },

    allowedProducts: [
        'Mach 6', 'Mach 7', 'Mach X 3', 'Skyward X', 'Skyward X 2', 'Skyward Laceless',
        'Clifton 10', 'Clifton 9 GTX', 'Bondi 9', 'Bondi SR', 'Arahi 8', 'Arahi SR',
        'Skyflow', 'Gaviota 5', 'Gaviota 6',
        'Transport', 'Transport 2', 'Transport Chukka', 'Transport Chukka GTX',
        'Transport GTX', 'Transport Hike', 'Transport Hike GTX', 'Transport Mid',
        'Solimar', 'Solimar 2',
        'Speedgoat 6', 'Speedgoat 6 GTX', 'Speedgoat 6 Mid GTX', 'Speedgoat 7',
        'Challenger 8', 'Challenger 8 GTX', 'Stinson 7',
        'Mafate X', 'Mafate 5', 'Tecton X 3', 'Zinal 3',
        'Cielo X1 2.0', 'Cielo X1 3.0', 'Cielo X MD', 'Cielo X 3 MD', 'Cielo X 3 LD',
        'Rocket X 3'
    ],

    isAllowedProduct: function(productName) {
        if (!productName) return false;
        var nameLower = productName.toLowerCase();
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');

        // Strip WIDE/X-WIDE suffix for matching purposes (but not from GTX WIDE -> must keep GTX)
        var nameBase = nameLower.replace(/\s+(?:x-wide|xwide)$/i, '').replace(/\s+wide$/i, '').trim();

        if (nameBase.includes('arahi')) {
            return nameBase.includes('arahi 8') || nameBase.includes('arahi8') ||
                   nameBase.includes('arahi sr');
        }
        if (nameBase.includes('gaviota')) {
            return nameBase.includes('gaviota 5') || nameBase.includes('gaviota5') ||
                   nameBase.includes('gaviota 6') || nameBase.includes('gaviota6');
        }
        if (nameBase.includes('mach')) {
            if (nameBase.includes('mach x') || nameBase.includes('machx')) {
                return nameBase.includes('mach x 3') || nameBase.includes('machx3') || nameBase.includes('mach x3');
            }
            return nameBase.includes('mach 6') || nameBase.includes('mach6') ||
                   nameBase.includes('mach 7') || nameBase.includes('mach7');
        }
        if (nameBase.includes('speedgoat')) {
            return nameBase.includes('speedgoat 6') || nameBase.includes('speedgoat6') ||
                   nameBase.includes('speedgoat 7') || nameBase.includes('speedgoat7');
        }
        if (nameBase.includes('bondi')) {
            return nameBase.includes('bondi 9') || nameBase.includes('bondi9') ||
                   nameBase.includes('bondi sr');
        }
        if (nameBase.includes('clifton')) {
            return nameBase.includes('clifton 10') || nameBase.includes('clifton10') ||
                   nameBase.includes('clifton 9 gtx');
        }
        if (nameBase.includes('skyward')) {
            return nameBase.includes('skyward x 2') || nameBase.includes('skyward x2') ||
                   nameBase.includes('skyward x') || nameBase.includes('skyward laceless');
        }
        if (nameBase.includes('transport')) {
            // Accept all transport variants: Transport, Transport 2, Chukka, GTX, Hike, Mid, Hike GTX, Chukka GTX
            return true;
        }
        if (nameBase.includes('challenger')) {
            return nameBase.includes('challenger 8') || nameBase.includes('challenger8');
        }
        if (nameBase.includes('cielo')) {
            return nameBase.includes('cielo x1') || nameBase.includes('cielo x md') ||
                   nameBase.includes('cielo x 3');
        }
        if (nameBase.includes('rocket x')) {
            return nameBase.includes('rocket x 3') || nameBase.includes('rocket x3');
        }
        if (nameBase.includes('mafate')) {
            return nameBase.includes('mafate x') || nameBase.includes('mafate 5') || nameBase.includes('mafate5');
        }
        if (nameBase.includes('solimar')) {
            return nameBase.includes('solimar 2') || nameBase.includes('solimar2') ||
                   nameBase === 'solimar';
        }
        // Simple name matches
        var simpleMatches = ['skyflow', 'stinson 7', 'tecton x 3', 'zinal 3'];
        for (var i = 0; i < simpleMatches.length; i++) {
            if (nameBase.includes(simpleMatches[i])) return true;
        }
        return false;
    },

    getMatchingProduct: function(productName) {
        if (!productName) return null;
        var nameLower = productName.toLowerCase();
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');

        // Strip WIDE/X-WIDE suffix for matching (but not from GTX WIDE -> must keep GTX)
        var nameBase = nameLower.replace(/\s+(?:x-wide|xwide)$/i, '').replace(/\s+wide$/i, '').trim();

        if (nameBase.includes('arahi')) {
            if (nameBase.includes('arahi sr')) return 'Arahi SR';
            if (nameBase.includes('arahi 8') || nameBase.includes('arahi8')) return 'Arahi 8';
            return null;
        }
        if (nameBase.includes('gaviota')) {
            if (nameBase.includes('gaviota 6') || nameBase.includes('gaviota6')) return 'Gaviota 6';
            if (nameBase.includes('gaviota 5') || nameBase.includes('gaviota5')) return 'Gaviota 5';
            return null;
        }
        if (nameBase.includes('mach')) {
            if (nameBase.includes('mach x') || nameBase.includes('machx')) {
                if (nameBase.includes('mach x 3') || nameBase.includes('machx3') || nameBase.includes('mach x3')) return 'Mach X 3';
                return null; // Reject Mach X 2 etc.
            }
            if (nameBase.includes('mach 7') || nameBase.includes('mach7')) return 'Mach 7';
            if (nameBase.includes('mach 6') || nameBase.includes('mach6')) return 'Mach 6';
            return null;
        }
        if (nameBase.includes('speedgoat')) {
            if (nameBase.includes('speedgoat 7') || nameBase.includes('speedgoat7')) return 'Speedgoat 7';
            // Speedgoat 6 variants — check most specific first
            if (nameBase.includes('speedgoat 6 mid gtx') || nameBase.includes('speedgoat6 mid gtx')) return 'Speedgoat 6 Mid GTX';
            if (nameBase.includes('speedgoat 6 gtx') || nameBase.includes('speedgoat6 gtx')) return 'Speedgoat 6 GTX';
            if (nameBase.includes('speedgoat 6') || nameBase.includes('speedgoat6')) return 'Speedgoat 6';
            return null;
        }
        if (nameBase.includes('bondi')) {
            if (nameBase.includes('bondi sr')) return 'Bondi SR';
            if (nameBase.includes('bondi 9') || nameBase.includes('bondi9')) return 'Bondi 9';
            return null;
        }
        if (nameBase.includes('clifton')) {
            if (nameBase.includes('clifton 9 gtx')) return 'Clifton 9 GTX';
            if (nameBase.includes('clifton 10') || nameBase.includes('clifton10')) return 'Clifton 10';
            return null;
        }
        if (nameBase.includes('skyward')) {
            if (nameBase.includes('skyward laceless')) return 'Skyward Laceless';
            if (nameBase.includes('skyward x 2') || nameBase.includes('skyward x2')) return 'Skyward X 2';
            if (nameBase.includes('skyward x')) return 'Skyward X';
            return null;
        }
        if (nameBase.includes('transport')) {
            // Most specific first
            if (nameBase.includes('chukka') && nameBase.includes('gtx')) return 'Transport Chukka GTX';
            if (nameBase.includes('chukka')) return 'Transport Chukka';
            if (nameBase.includes('hike') && nameBase.includes('gtx')) return 'Transport Hike GTX';
            if (nameBase.includes('hike')) return 'Transport Hike';
            if (nameBase.includes('mid')) return 'Transport Mid';
            if (nameBase.includes('gtx')) return 'Transport GTX';
            if (nameBase.includes('transport 2') || nameBase.includes('transport2')) return 'Transport 2';
            return 'Transport';
        }
        if (nameBase.includes('challenger')) {
            if (nameBase.includes('challenger 8 gtx') || nameBase.includes('challenger8 gtx')) return 'Challenger 8 GTX';
            if (nameBase.includes('challenger 8') || nameBase.includes('challenger8')) return 'Challenger 8';
            return null;
        }
        if (nameBase.includes('cielo')) {
            if (nameBase.includes('cielo x1 3.0') || nameBase.includes('cielo x1 3')) return 'Cielo X1 3.0';
            if (nameBase.includes('cielo x1 2.0') || nameBase.includes('cielo x1 2')) return 'Cielo X1 2.0';
            if (nameBase.includes('cielo x1')) return 'Cielo X1 3.0'; // default to newest
            if (nameBase.includes('cielo x 3 md')) return 'Cielo X 3 MD';
            if (nameBase.includes('cielo x 3 ld')) return 'Cielo X 3 LD';
            if (nameBase.includes('cielo x md')) return 'Cielo X MD';
            return null;
        }
        if (nameBase.includes('rocket x')) {
            if (nameBase.includes('rocket x 3') || nameBase.includes('rocket x3')) return 'Rocket X 3';
            return null;
        }
        if (nameBase.includes('mafate')) {
            if (nameBase.includes('mafate x')) return 'Mafate X';
            if (nameBase.includes('mafate 5') || nameBase.includes('mafate5')) return 'Mafate 5';
            return null;
        }
        if (nameBase.includes('solimar')) {
            if (nameBase.includes('solimar 2') || nameBase.includes('solimar2')) return 'Solimar 2';
            if (nameBase === 'solimar') return 'Solimar';
            return 'Solimar';
        }
        if (nameBase.includes('skyflow')) return 'Skyflow';
        if (nameBase.includes('stinson 7') || nameBase.includes('stinson7')) return 'Stinson 7';
        if (nameBase.includes('tecton x 3') || nameBase.includes('tecton x3')) return 'Tecton X 3';
        if (nameBase.includes('zinal 3') || nameBase.includes('zinal3')) return 'Zinal 3';

        return null;
    },

    formatGender: function(division) {
        if (!division) return 'Unisex';
        var divStr = division.toString().trim();
        if (divStr.toLowerCase() === "women's" || divStr.toLowerCase() === "womens" || divStr === "W") return "Women's";
        if (divStr.toLowerCase() === "men's" || divStr.toLowerCase() === "mens" || divStr === "M") return "Men's";
        if (divStr.toLowerCase() === "youth" || divStr.toLowerCase() === "kids") return 'Youth';
        if (divStr.toLowerCase() === "unisex" || divStr === "U" || divStr === '') return 'Unisex';
        return divStr;
    },

    formatGenderForHandle: function(gender) {
        if (!gender) return 'unisex';
        var g = gender.toString().toLowerCase();
        if (g.includes('men') && !g.includes('women')) return 'mens';
        if (g.includes('women')) return 'womens';
        return 'unisex';
    },

    // ========== SMART HANDLE GENERATION ==========
    // Step 1: Check if existing handle exists for this style+color combo
    // Step 2: If not, generate a new uniform handle: hoka-{gender}-{model}-{colorway}[-wide]
    getProductHandle: function(lookupKey, matchingProduct, colorway, gender, width) {
        // STEP 1: Check existing handles
        if (this.existingHandles[lookupKey]) {
            var baseHandle = this.existingHandles[lookupKey];
            // Add width suffix for wide shoes
            if (width === 'EE' || width === 'EEEE') {
                return baseHandle + '-wide';
            }
            return baseHandle;
        }

        // STEP 2: NEW PRODUCT - Generate uniform format
        // Format: hoka-{gender}-{model}-{colorway}[-wide]
        var genderPrefix = this.formatGenderForHandle(gender);

        var baseHandle = ('hoka-' + genderPrefix + '-' + matchingProduct + '-' + colorway)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        // Add width suffix
        if (width === 'EE' || width === 'EEEE') {
            return baseHandle + '-wide';
        }

        return baseHandle;
    },

    convert: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            try {
                var reader = new FileReader();

                reader.onload = function(e) {
                    try {
                        var data = [];

                        if (file.name.toLowerCase().endsWith('.xlsx') ||
                            file.name.toLowerCase().endsWith('.xls')) {
                            var arrayBuffer = e.target.result;
                            var workbook = XLSX.read(arrayBuffer);
                            var worksheet = workbook.Sheets[workbook.SheetNames[0]];
                            data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        } else {
                            var text = e.target.result;
                            var parseResult = Papa.parse(text, {
                                delimiter: '\t',
                                header: false,
                                skipEmptyLines: true,
                                dynamicTyping: true
                            });
                            data = parseResult.data;
                        }

                        // Skip header row if it exists
                        var startIdx = 0;
                        if (data.length > 0 && (data[0][0] === 'Division' || data[0][5] === 'Style Name' || data[0][5] === 'Product Name')) {
                            startIdx = 1;
                        }

                        var filteredProducts = data.slice(startIdx).filter(function(row) {
                            if (!row || row.length < 10) return false;
                            var productName = row[5];
                            var division = row[0];
                            if (division && (division.toString().trim().toLowerCase() === 'youth' ||
                                           division.toString().trim().toLowerCase() === 'kids' ||
                                           division.toString().trim().toUpperCase() === 'Y')) {
                                return false;
                            }
                            return self.isAllowedProduct(productName);
                        });

                        var processedVariants = new Map();

                        for (var i = 0; i < filteredProducts.length; i++) {
                            var product = filteredProducts[i];

                            var division = product[0];
                            var productName = product[5];
                            var colorway = product[6];
                            var styleSKU = product[7];
                            var sizeInfo = product[8];
                            var variantSKU = product[9];
                            var upc = product[10];
                            var availableDate = product[11];
                            var quantity = product[12];
                            var retail = product[14];

                            if (!self.isAvailableNow(availableDate)) {
                                continue;
                            }

                            var matchingProduct = self.getMatchingProduct(productName);
                            if (!matchingProduct) continue;

                            // Detect gender: prefer product name prefix for unisex items
                            var formattedGender;
                            var namePrefix = productName.toString().trim().charAt(0).toUpperCase();
                            if (namePrefix === 'U') {
                                formattedGender = 'Unisex';
                            } else {
                                formattedGender = self.formatGender(division);
                            }

                            var size = sizeInfo ? sizeInfo.toString().replace(/[A-Z]/g, '') : '';
                            if (size) {
                                size = size.replace(/^0/, '');
                                // For unisex dual-sizing (e.g. "05.5/07"), keep the first size (men's)
                                if (size.includes('/')) {
                                    size = size.split('/')[0];
                                }
                                // Remove leading zero again after split
                                size = size.replace(/^0/, '');
                                if (!size.includes('.')) {
                                    size = size + '.0';
                                }
                            }

                            var width = 'Regular';
                            if (variantSKU && sizeInfo) {
                                var skuUpper = variantSKU.toUpperCase();
                                var isWomen = formattedGender === "Women's";
                                var sizeStr = sizeInfo.toString().toUpperCase();
                                var nameUpper = productName ? productName.toUpperCase() : '';

                                if (nameUpper.includes('X-WIDE') || nameUpper.includes('XWIDE')) {
                                    width = 'Extra Wide';
                                } else if (nameUpper.includes(' WIDE')) {
                                    width = 'Wide';
                                } else if (isWomen) {
                                    if (sizeStr.includes('EE') || sizeStr.includes('2E')) {
                                        width = 'Extra Wide';
                                    } else if (sizeStr.endsWith('D') || sizeStr.includes('D ')) {
                                        width = 'Wide';
                                    } else if (skuUpper.includes('EE') || skuUpper.includes('2E')) {
                                        width = 'Extra Wide';
                                    } else if (skuUpper.match(/\d+\.?\d*D$/i) || skuUpper.includes('-D-') || skuUpper.endsWith('-D')) {
                                        width = 'Wide';
                                    }
                                } else {
                                    if (sizeStr.includes('EEEE') || skuUpper.includes('EEEE')) {
                                        width = 'Extra Wide';
                                    } else if (sizeStr.includes('EE') || sizeStr.includes('2E') || skuUpper.includes('EE') || skuUpper.includes('2E')) {
                                        width = 'Wide';
                                    }
                                }
                            }

                            var variantKey = formattedGender + '-' + matchingProduct + '-' + colorway + '-' + size + '-' + width;

                            var actualQuantity = 0;
                            if (typeof quantity === 'string') {
                                if (quantity.includes('+')) {
                                    actualQuantity = parseInt(quantity.replace('+', '')) || 100;
                                } else {
                                    actualQuantity = parseInt(quantity) || 0;
                                }
                            } else if (typeof quantity === 'number') {
                                actualQuantity = quantity;
                            }

                            if (processedVariants.has(variantKey)) {
                                var existing = processedVariants.get(variantKey);
                                existing.quantity += actualQuantity;
                                continue;
                            }

                            processedVariants.set(variantKey, {
                                division: division,
                                gender: formattedGender,
                                productName: productName,
                                matchingProduct: matchingProduct,
                                colorway: colorway,
                                styleSKU: styleSKU,
                                size: size,
                                width: width,
                                variantSKU: variantSKU,
                                upc: upc,
                                quantity: actualQuantity,
                                retail: retail
                            });
                        }

                        var sortedVariants = Array.from(processedVariants.entries()).sort(function(a, b) {
                            var dataA = a[1];
                            var dataB = b[1];
                            if (dataA.matchingProduct !== dataB.matchingProduct) return dataA.matchingProduct.localeCompare(dataB.matchingProduct);
                            if (dataA.gender !== dataB.gender) {
                                if (dataA.gender === "Men's") return -1;
                                if (dataB.gender === "Men's") return 1;
                                return dataA.gender.localeCompare(dataB.gender);
                            }
                            if (dataA.colorway !== dataB.colorway) return dataA.colorway.localeCompare(dataB.colorway);
                            if (dataA.width !== dataB.width) {
                                if (dataA.width === 'Regular') return -1;
                                if (dataB.width === 'Regular') return 1;
                                return dataA.width.localeCompare(dataB.width);
                            }
                            return (parseFloat(dataA.size) || 0) - (parseFloat(dataB.size) || 0);
                        });

                        var shopifyInventory = [];

                        for (var j = 0; j < sortedVariants.length; j++) {
                            var variantData = sortedVariants[j][1];

                            var productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;

                            // Build lookup key: styleNumber-colorCode from variantSKU
                            var skuParts = variantData.variantSKU.split('-');
                            var lookupKey = skuParts[0] + '-' + skuParts[1];

                            // Determine width code for handle generation
                            var widthCode = '';
                            if (variantData.width === 'Wide') {
                                widthCode = 'EE';
                            } else if (variantData.width === 'Extra Wide') {
                                widthCode = 'EEEE';
                            }

                            // Use smart handle generation
                            var handle = self.getProductHandle(lookupKey, variantData.matchingProduct, variantData.colorway, variantData.gender, widthCode);

                            var hasWidth = variantData.width !== 'Regular';
                            var finalTitle = productTitle + (hasWidth ? ' (' + variantData.width + ')' : '');

                            shopifyInventory.push({
                                Handle: handle,
                                Title: finalTitle,
                                'Option1 Name': 'Size',
                                'Option1 Value': variantData.size,
                                'Option2 Name': '',
                                'Option2 Value': '',
                                'Option3 Name': '',
                                'Option3 Value': '',
                                SKU: variantData.variantSKU,
                                Barcode: variantData.upc || '',
                                'HS Code': '',
                                COO: '',
                                Location: 'Needham',
                                'Bin name': '',
                                'Incoming (not editable)': '',
                                'Unavailable (not editable)': '',
                                'Committed (not editable)': '',
                                'Available (not editable)': '',
                                'On hand (current)': '',
                                'On hand (new)': variantData.quantity
                            });
                        }

                        self.inventoryData = shopifyInventory;
                        resolve(shopifyInventory);

                    } catch (error) {
                        console.error('HOKA conversion error:', error);
                        reject(error);
                    }
                };

                reader.onerror = function() {
                    reject(new Error('Failed to read file'));
                };

                if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.readAsText(file);
                }

            } catch (error) {
                console.error('HOKA conversion error:', error);
                reject(error);
            }
        });
    },

    generateInventoryCSV: function() {
        if (typeof Papa !== 'undefined') {
            return Papa.unparse(this.inventoryData, {
                quotes: true,
                quoteChar: '"',
                delimiter: ','
            });
        }

        var inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
                       '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
                       '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
                       '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];

        var csvRows = [inventoryHeaders.join(',')];

        this.inventoryData.forEach(function(row) {
            var csvRow = [
                row.Handle,
                '"' + row.Title.replace(/"/g, '""') + '"',
                row['Option1 Name'],
                row['Option1 Value'],
                row['Option2 Name'] || '',
                row['Option2 Value'] || '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
                row.SKU,
                row.Barcode || '',
                '', '',
                row.Location,
                '', '', '', '', '', '',
                row['On hand (new)']
            ];
            csvRows.push(csvRow.join(','));
        });

        return csvRows.join('\n');
    }
};
