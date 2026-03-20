// HOKA Converter Logic - WITH HARDCODED HANDLES + UNIFIED FORMAT
const HokaConverter = {
    inventoryData: [],
    brandName: 'hoka',

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
        '1123154-EEGG': 'women-s-transport-eggnog-eggnog-extra-wide',
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
        '1134234-BBLC': 'men-s-gaviota-5-black-black-wide',
        '1134234-BHFG': 'men-s-gaviota-5-birch-foggy-night-wide',
        '1134234-BWHT': 'gaviota-5-black-white-wide',
        '1134234-BYT': 'men-s-gaviota-5-barley-oat-milk-wide',
        '1134234-DHN': 'gaviota-5-downpour-thunder-cloud-wide',
        '1134234-LDVB': 'gaviota-5-limestone-diva-blue-wide',
        '1134234-VYN': 'men-s-gaviota-5-varsity-navy-white-wide',
        '1134235-ALJ': 'women-s-gaviota-5-alpine-blue-jadeite',
        '1134235-ARP': 'gaviota-5-anchor-grapefruit',
        '1134235-BWHT': 'gaviota-5-black-white',
        '1134235-SWML': 'women-s-gaviota-5-snow-melt-cielo-blue',
        '1134270-ALJ': 'women-s-gaviota-5-alpine-blue-jadeite-wide',
        '1134270-ARP': 'women-s-gaviota-5-anchor-grapefruit-wide',
        '1134270-BBLC': 'women-s-gaviota-5-black-black-wide',
        '1134270-BWHT': 'gaviota-5-black-white-wide',
        '1134270-FTRS': 'gaviota-5-frost-rose-gold-wide',
        '1134270-HMRG': 'gaviota-5-harbor-mist-rose-gold-wide',
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
        '1147830-CDN': 'speedgoat-6-charcoal-grey-midnight-blue-wide',
        '1147830-GCG': 'speedgoat-6-galactic-grey-hoka-blue-wide',
        '1147830-PTYB': 'speedgoat-6-putty-blue-twilight-wide',
        '1147832-GMC': 'speedgoat-6-grey-skies-cosmic-grey-wide',
        '1147832-MNLG': 'women-s-speedgoat-6-moonlight-thunder-cloud-wide',
        '1147832-SYST': 'speedgoat-6-stellar-grey-asteroid-wide',
        '1147833-AFF': 'men-s-mach-6-antique-olive-truffle-salt-wide',
        '1147833-BNGH': 'men-s-mach-6-black-night-sky-wide',
        '1147833-BWHT': 'mach-6-black-white-wide',
        '1147833-DHN': 'men-s-mach-6-downpour-thunder-cloud-wide',
        '1147833-FTG': 'men-s-mach-6-frost-gold-wide',
        '1147834-BWHT': 'women-s-mach-6-black-white-wide',
        '1147834-EGV': 'women-s-mach-6-eggnog-vanilla-wide',
        '1147834-FTRS': 'women-s-mach-6-frost-rose-gold-wide',
        '1147834-JTL': 'women-s-mach-6-jadeite-alpine-blue-wide',
        '1147834-PLDS': 'women-s-mach-6-pale-dusk-gull-wide',
        '1147834-RSLT': 'mach-6-rose-latte-blush-wide',
        '1147834-TNDR': 'mach-6-tundra-blue-raindrop-wide',
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
        '1155117-BWHT': 'men-s-skyflow-black-white-wide',
        '1155117-DHN': 'men-s-skyflow-downpour-thunder-cloud-wide',
        '1155117-DRZY': 'men-s-skyflow-druzy-droplet-wide',
        '1155117-MVR': 'men-s-skyflow-midnight-blue-varsity-navy-wide',
        '1155117-VVY': 'men-s-skyflow-varsity-navy-electric-cobalt-wide',
        '1155117-WSHR': 'men-s-skyflow-wild-mushroom-grassland-wide',
        '1155118-ARVN': 'women-s-skyflow-alabaster-vintage-green-wide',
        '1155118-ATRM': 'women-s-skyflow-alabaster-mineral-blue-wide',
        '1155118-BWHT': 'women-s-skyflow-black-white-wide',
        '1155118-NKN': 'women-s-skyflow-nautical-dusk-anchor-wide',
        '1155118-RRMR': 'women-s-skyflow-rose-cream-rose-latte-wide',
        '1155118-SLWC': 'women-s-skyflow-starlight-glow-carnation-wide',
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
        '1155770-BCKT': 'men-s-speedgoat-6-black-outer-orbit-wide',
        '1155771-BCKT': 'women-s-speedgoat-6-black-outer-orbit-wide',
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
        '1162013-BBLC': 'men-s-bondi-9-black-black-wide',
        '1162013-BWHT': 'men-s-bondi-9-black-white-wide',
        '1162013-CWG': 'men-s-bondi-9-carbon-black-yellow-gold-wide',
        '1162013-CYLT': 'men-s-bondi-9-cosmic-grey-ultramarine-wide',
        '1162013-DNP': 'men-s-bondi-9-drizzle-downpour-wide',
        '1162013-FDNV': 'men-s-bondi-9-faded-navy-slate-blue-wide',
        '1162013-GCTC': 'men-s-bondi-9-galactic-grey-stellar-grey-wide',
        '1162013-GSSL': 'men-s-bondi-9-grassland-oyster-mushroom-wide',
        '1162013-MVR': 'men-s-bondi-9-midnight-blue-varsity-navy-wide',
        '1162013-SCCG': 'men-s-bondi-9-stucco-grout-wide',
        '1162013-SLHK': 'men-s-bondi-9-skyward-blue-hoka-blue-wide',
        '1162013-TDRC': 'men-s-bondi-9-thunder-cloud-vermillion-wide',
        '1162013-VYN': 'men-s-bondi-9-varsity-navy-white-wide',
        '1162014-ALBST': 'women-s-bondi-9-alabaster-birch-wide',
        '1162014-BBLC': 'women-s-bondi-9-black-black-wide',
        '1162014-BJM': 'hoka-womens-bondi-9-berry-jam-berry-patch-wide',
        '1162014-BTF': 'women-s-bondi-9-blue-spark-mint-fluorite-wide',
        '1162014-BWHT': 'women-s-bondi-9-black-white-wide',
        '1162014-CYWH': 'women-s-bondi-9-cosmic-grey-white-wide',
        '1162014-GNGB': 'women-s-bondi-9-glimmering-blue-overcast-wide',
        '1162014-LRMT': 'women-s-bondi-9-lilac-cream-tangerine-glow-wide',
        '1162014-MBLW': 'women-s-bondi-9-mineral-blue-washed-blue-wide',
        '1162014-RLTT': 'women-s-bondi-9-rose-latte-rose-cream-wide',
        '1162014-RSTP': 'women-s-bondi-9-rose-tea-petal-wide',
        '1162014-SDSTS': 'women-s-bondi-9-stardust-silver-wide',
        '1162014-TLSL': 'women-s-bondi-9-truffle-salt-sea-glass-wide',
        '1162014-VCH': 'women-s-bondi-9-vanilla-birch-wide',
        '1162014-WWH': 'women-s-bondi-9-white-white-wide',
        '1162015-BBLC': 'men-s-bondi-9-black-black-extra-wide',
        '1162015-BWHT': 'men-s-bondi-9-black-white-extra-wide',
        '1162015-DNP': 'men-s-bondi-9-drizzle-downpour-extra-wide',
        '1162015-GCTC': 'men-s-bondi-9-galactic-grey-stellar-grey-extra-wide',
        '1162015-VYN': 'men-s-bondi-9-varsity-navy-white-extra-wide',
        '1162016-BBLC': 'women-s-bondi-9-black-black-extra-wide',
        '1162016-BWHT': 'women-s-bondi-9-black-white-extra-wide',
        '1162016-MBLW': 'women-s-bondi-9-mineral-blue-washed-blue-extra-wide',
        '1162016-RLTT': 'women-s-bondi-9-rose-latte-rose-cream-extra-wide',
        '1162016-SDSTS': 'women-s-bondi-9-stardust-silver-extra-wide',
        '1162016-WWH': 'women-s-bondi-9-white-white-extra-wide',
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
        '1162032-ALF': 'men-s-clifton-10-alpine-blue-foggy-night-wide',
        '1162032-BBLC': 'men-s-clifton-10-black-black-wide',
        '1162032-BKSV': 'men-s-clifton-10-black-silver-wide',
        '1162032-BWHT': 'men-s-clifton-10-black-white-wide',
        '1162032-GYST': 'men-s-clifton-10-galactic-grey-asteroid-wide',
        '1162032-HSK': 'men-s-clifton-10-hoka-blue-skyward-blue-wide',
        '1162032-NMD': 'men-s-clifton-10-night-sky-midnight-blue-wide',
        '1162032-NWT': 'men-s-clifton-10-navy-white-wide',
        '1162032-PTYG': 'men-s-clifton-10-putty-grout-wide',
        '1162032-RNN': 'men-s-clifton-10-raw-linen-stone-wide',
        '1162032-STLLR': 'men-s-clifton-10-stellar-grey-stardust-wide',
        '1162032-VLLN': 'men-s-clifton-10-vermillion-varsity-navy-wide',
        '1162032-WKY': 'men-s-clifton-10-white-skyward-blue-wide',
        '1162032-WWH': 'men-s-clifton-10-white-white-wide',
        '1162032-YDT': 'men-s-clifton-10-yellow-gold-tidal-wave-wide',
        '1162050-BBLC': 'women-s-clifton-10-black-black-wide',
        '1162050-BHLB': 'women-s-clifton-10-birch-alabaster-wide',
        '1162050-BHRS': 'women-s-clifton-10-blush-rose-latte-wide',
        '1162050-BWHT': 'women-s-clifton-10-black-white-wide',
        '1162050-CRDS': 'women-s-clifton-10-cosmic-grey-stardust-wide',
        '1162050-CTNS': 'women-s-clifton-10-carnation-starlight-glow-wide',
        '1162050-GRTM': 'women-s-clifton-10-grout-mineral-blue-wide',
        '1162050-MLST': 'hoka-womens-clifton-10-midnight-blue-starlight-glow-wide',
        '1162050-NYL': 'women-s-clifton-10-night-sky-ultramarine-wide',
        '1162050-OTP': 'women-s-clifton-10-overcast-petal-wide',
        '1162050-RMD': 'women-s-clifton-10-rose-cream-dried-rose-wide',
        '1162050-SJD': 'women-s-clifton-10-sea-glass-jadeite-wide',
        '1162050-SKYW': 'women-s-clifton-10-skyward-blue-cielo-blue-wide',
        '1162050-SLSSN': 'women-s-clifton-10-sea-glass-neon-flame-wide',
        '1162050-SRYG': 'women-s-clifton-10-stellar-grey-galactic-grey-wide',
        '1162050-VCH': 'women-s-clifton-10-vanilla-birch-wide',
        '1162050-WTCL': 'women-s-clifton-10-white-cielo-blue-wide',
        '1162050-WWH': 'women-s-clifton-10-white-white-wide',
        '1162051-BBLC': 'men-s-clifton-10-black-black-extra-wide',
        '1162051-BWHT': 'men-s-clifton-10-black-white-extra-wide',
        '1162051-HSK': 'men-s-clifton-10-hoka-blue-skyward-blue-extra-wide',
        '1162051-NWT': 'men-s-clifton-10-navy-white-extra-wide',
        '1162051-PTYG': 'men-s-clifton-10-putty-grout-extra-wide',
        '1162051-STLLR': 'men-s-clifton-10-stellar-grey-stardust-extra-wide',
        '1162052-BBLC': 'women-s-clifton-10-black-black-extra-wide',
        '1162052-BWHT': 'women-s-clifton-10-black-white-extra-wide',
        '1162052-GRTM': 'women-s-clifton-10-grout-mineral-blue-extra-wide',
        '1162052-SKYW': 'women-s-clifton-10-skyward-blue-cielo-blue-extra-wide',
        '1162052-WWH': 'women-s-clifton-10-white-white-extra-wide',
        '1164370-BBLC': 'men-s-transport-black-black-wide',
        '1164370-BKLB': 'men-s-transport-black-alabaster-wide',
        '1164370-VYN': 'men-s-transport-varsity-navy-white-wide',
        '1164371-BKLB': 'women-s-transport-black-alabaster-wide',
        '1164371-EEGG': 'women-s-transport-eggnog-eggnog-wide',
        '1164371-WWH': 'women-s-transport-white-white-wide',
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
        '1168710-BBLC': 'men-s-arahi-8-black-black-wide',
        '1168710-BKSK': 'men-s-arahi-8-black-skyward-blue-wide',
        '1168710-BWHT': 'men-s-arahi-8-black-white-wide',
        '1168710-CBLTB': 'men-s-arahi-8-cobalt-blue-neon-green-wide',
        '1168710-GTP': 'men-s-arahi-8-grout-putty-wide',
        '1168710-SCCG': 'men-s-arahi-8-stucco-grout-wide',
        '1168710-SSTC': 'men-s-arahi-8-stardust-cosmic-grey-wide',
        '1168710-VYN': 'men-s-arahi-8-varsity-navy-white-wide',
        '1168711-ARTN': 'women-s-arahi-8-alabaster-tangerine-glow-wide',
        '1168711-BBLC': 'women-s-arahi-8-black-black-wide',
        '1168711-BHLB': 'women-s-arahi-8-birch-alabaster-wide',
        '1168711-BRGL': 'women-s-arahi-8-black-rose-gold-wide',
        '1168711-BWHT': 'women-s-arahi-8-black-white-wide',
        '1168711-RCRM': 'women-s-arahi-8-rose-cream-alabaster-wide',
        '1168711-SLWM': 'hoka-womens-arahi-8-starlight-glow-midnight-blue-wide',
        '1168711-WWH': 'women-s-arahi-8-white-white-wide',
        '1168718-BCKT': 'men-s-challenger-8-black-outer-orbit-wide',
        '1168718-FMP': 'men-s-challenger-8-faded-navy-pampas-grass-wide',
        '1168718-JDT': 'men-s-challenger-8-jade-truffle-salt-wide',
        '1168718-MGRT': 'men-s-challenger-8-midnight-blue-grout-wide',
        '1168719-JDC': 'women-s-challenger-8-jade-cosmic-grey-wide',
        '1168719-MGRT': 'women-s-challenger-8-midnight-blue-grout-wide',
        '1168719-SPHL': 'women-s-challenger-8-stucco-asphalt-grey-wide',
        '1168720-NNHK': 'mach-x-3-neon-hoka-citrus-neon-lime',
        '1168720-NZS': 'men-s-mach-x-3-neon-yuzu-squid-ink',
        '1168720-WBS': 'men-s-mach-x-3-white-alabaster',
        '1168720-WNG': 'men-s-mach-x-3-white-neon-tangerine',
        '1168721-NNRS': 'women-s-mach-x-3-neon-rose-neon-tangerine',
        '1168721-NZS': 'women-s-mach-x-3-neon-yuzu-squid-ink',
        '1168721-WBS': 'women-s-mach-x-3-white-alabaster',
        '1168721-WNL': 'women-s-mach-x-3-white-neon-lime',
        '1169450-BBLC': 'men-s-transport-gtx-black-black-wide',
        '1169451-DEGG': 'women-s-transport-gtx-dune-eggnog-wide',
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
        '1171905-ASRN': 'men-s-mach-7-alabaster-soaring-blue-wide',
        '1171905-AYCB': 'men-s-mach-7-ash-grey-cobalt-blue-wide',
        '1171905-BWHT': 'men-s-mach-7-black-white-wide',
        '1171905-FYZ': 'men-s-mach-7-frost-neon-yuzu-wide',
        '1171905-VFD': 'men-s-mach-7-varsity-navy-faded-navy-wide',
        '1171906-ASRN': 'women-s-mach-7-alabaster-soaring-blue-wide',
        '1171906-BWHT': 'women-s-mach-7-black-white-wide',
        '1171906-FTRS': 'women-s-mach-7-frost-rose-gold-wide',
        '1171906-LRMT': 'women-s-mach-7-lilac-cream-tangerine-glow-wide',
        '1171906-LYC': 'women-s-mach-7-lingonberry-cranberry-wide',
        '1171928-BWHT': 'men-s-speedgoat-7-black-white',
        '1171928-KWN': 'men-s-speedgoat-7-kiwi-neon-yuzu',
        '1171928-VMR': 'men-s-speedgoat-7-vintage-yellow-turmeric',
        '1171929-BWHT': 'women-s-speedgoat-7-black-white',
        '1171929-PYZ': 'women-s-speedgoat-7-persimmon-neon-yuzu',
        '1171929-VWN': 'women-s-speedgoat-7-vintage-yellow-neon-flame',
        '1171930-BFS': 'hoka-mens-speedgoat-7-bay-leaf-sea-glass-wide',
        '1171930-BWHT': 'men-s-speedgoat-7-black-white-wide',
        '1171931-BWHT': 'women-s-speedgoat-7-black-white-wide',
        '1171931-VWN': 'women-s-speedgoat-7-vintage-yellow-neon-flame-wide',
        '1171932-BBLC': 'men-s-gaviota-6-black-black',
        '1171932-BWHT': 'men-s-gaviota-6-black-white',
        '1171932-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy',
        '1171932-STLLR': 'men-s-gaviota-6-stellar-grey-stardust',
        '1171933-BBLC': 'women-s-gaviota-6-black-black',
        '1171933-BHY': 'women-s-gaviota-6-birch-yellow-gold',
        '1171933-BWHT': 'women-s-gaviota-6-black-white',
        '1171933-CRDS': 'women-s-gaviota-6-cosmic-grey-stardust',
        '1171933-SSSG': 'women-s-gaviota-6-sea-glass-sage',
        '1171934-BBLC': 'men-s-gaviota-6-black-black-wide',
        '1171934-BWHT': 'men-s-gaviota-6-black-white-wide',
        '1171934-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy-wide',
        '1171934-STLLR': 'men-s-gaviota-6-stellar-grey-stardust-wide',
        '1171935-BBLC': 'women-s-gaviota-6-black-black-wide',
        '1171935-BHY': 'women-s-gaviota-6-birch-yellow-gold-wide',
        '1171935-BWHT': 'women-s-gaviota-6-black-white-wide',
        '1171935-CRDS': 'women-s-gaviota-6-cosmic-grey-stardust-wide',
        '1171936-BBLC': 'men-s-gaviota-6-black-black-extra-wide',
        '1171936-BWHT': 'men-s-gaviota-6-black-white-extra-wide',
        '1171936-MLFD': 'men-s-gaviota-6-midnight-blue-faded-navy-extra-wide',
        '1171936-STLLR': 'men-s-gaviota-6-stellar-grey-stardust-extra-wide',
        '1171937-BBLC': 'women-s-gaviota-6-black-black-extra-wide',
        '1171937-BWHT': 'women-s-gaviota-6-black-white-extra-wide',
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
        '1174777-ABST': 'women-s-transport-alabaster-alabaster-wide',
        '1174777-BBLC': 'women-s-transport-black-black-wide',
        '1174777-BKLB': 'women-s-transport-black-alabaster',
        '1174777-SSTSG': 'women-s-transport-stardust-sea-glass-wide',
        '1174777-WWH': 'women-s-transport-white-white',
        '1174778-ABST': 'men-s-transport-alabaster-alabaster-wide',
        '1174778-BBLC': 'men-s-transport-black-black',
        '1174778-BKLB': 'men-s-transport-black-alabaster',
        '1174778-CMVN': 'men-s-transport-cream-vintage-yellow-wide',
        '1174778-GLST': 'men-s-transport-gravel-stucco-wide',
        '1175530-BBLC': 'men-s-arahi-8-black-black-extra-wide',
        '1175530-BWHT': 'men-s-arahi-8-black-white-extra-wide',
        '1175530-GTP': 'men-s-arahi-8-grout-putty-extra-wide',
        '1175530-VYN': 'men-s-arahi-8-varsity-navy-white-extra-wide',
        '1175531-BRGL': 'women-s-arahi-8-black-rose-gold-extra-wide',
        '1175531-BWHT': 'women-s-arahi-8-black-white-extra-wide',
        '1175531-RCRM': 'women-s-arahi-8-rose-cream-alabaster-extra-wide',
        '1175531-WWH': 'women-s-arahi-8-white-white-extra-wide',
        '1177330-ABST': 'men-s-solimar-alabaster-alabaster-wide',
        '1177330-BBLC': 'men-s-solimar-black-black-wide',
        '1177330-BWHT': 'men-s-solimar-black-white-wide',
        '1177330-STBY': 'men-s-solimar-stardust-bay-leaf-wide',
        '1177331-ABST': 'women-s-solimar-alabaster-alabaster-wide',
        '1177331-BBLC': 'women-s-solimar-black-black-wide',
        '1177331-BWHT': 'women-s-solimar-black-white-wide',
        '1155111-CYNN': 'men-s-skyflow-cosmic-grey-neon-green',
        '1162011-CBLL': 'men-s-bondi-9-cobalt-blue-ultramarine',
        '1162011-GYZ': 'men-s-bondi-9-grout-neon-yuzu',
        '1162012-LRMT': 'women-s-bondi-9-lilac-cream-tangerine-glow',
        '1162013-GYZ': 'men-s-bondi-9-grout-neon-yuzu-wide',
        '1162015-GYZ': 'men-s-bondi-9-grout-neon-yuzu-extra-wide',
        '1162030-AYNN': 'men-s-clifton-10-ash-grey-neon-green',
        '1162031-LRMT': 'women-s-clifton-10-lilac-cream-tangerine-glow',
        '1162050-LRMT': 'women-s-clifton-10-lilac-cream-tangerine-glow-wide',
        '1162052-LRMT': 'women-s-clifton-10-lilac-cream-tangerine-glow-extra-wide',
        '1168690-CBLTB': 'men-s-arahi-8-cobalt-blue-neon-green',
        '1168690-MBLW': 'men-s-arahi-8-mineral-blue-washed-blue',
        '1168691-LLP': 'women-s-arahi-8-lilac-cream-neon-cantaloupe',
        '1171852-CBLTB': 'men-s-solimar-cobalt-blue-neon-green',
        '1171853-LRMT': 'women-s-solimar-lilac-cream-tangerine-glow',
        '1171904-ASRN': 'men-s-mach-7-alabaster-soaring-blue',
        '1171904-AYCB': 'men-s-mach-7-ash-grey-cobalt-blue',
        '1171904-BBLC': 'men-s-mach-7-black-black',
        '1171904-BWHT': 'men-s-mach-7-black-white',
        '1171904-CBLTB': 'men-s-mach-7-cobalt-blue-neon-green',
        '1171904-FYZ': 'men-s-mach-7-frost-neon-yuzu',
        '1171904-VFD': 'men-s-mach-7-varsity-navy-faded-navy',
        '1171932-GRTS': 'men-s-gaviota-6-grout-stucco',
        '1171933-LMF': 'women-s-gaviota-6-lilac-cream-fragrant-lilac',
        '1171935-LMF': 'women-s-gaviota-6-lilac-cream-fragrant-lilac-wide',
        '1171937-LMF': 'women-s-gaviota-6-lilac-cream-fragrant-lilac-extra-wide',
        '1171938-ASRN': 'women-s-mach-7-alabaster-soaring-blue',
        '1171938-BBLC': 'women-s-mach-7-black-black',
        '1171938-BWHT': 'women-s-mach-7-black-white',
        '1171938-FTRS': 'women-s-mach-7-frost-rose-gold',
        '1171938-FYZ': 'women-s-mach-7-frost-neon-yuzu',
        '1171938-LRMT': 'women-s-mach-7-lilac-cream-tangerine-glow',
        '1171938-LYC': 'women-s-mach-7-lingonberry-cranberry',
    },

    // ========== WIDTH DETECTION ==========
    // Men's:    B=Narrow, D=Regular(no suffix), 2E/EE=Wide, 4E/EEEE=Extra Wide, 6E/EEEEEE=Extra Extra Wide
    // Women's:  2A/AA=Narrow, B=Regular(no suffix), D=Wide, 2E/EE=Extra Wide, 4E/EEEE=Extra Extra Wide
    detectWidth: function(sizeInfo, variantSKU, productName, isWomen) {
        var sizeStr = (sizeInfo || '').toString().toUpperCase();
        var skuUpper = (variantSKU || '').toString().toUpperCase();
        var nameUpper = (productName || '').toString().toUpperCase();

        // Product name takes highest priority (scraper encodes X-WIDE / WIDE in name)
        if (nameUpper.includes('X-WIDE') || nameUpper.includes('XWIDE') || nameUpper.includes('EXTRA WIDE')) {
            return 'Extra Wide';
        }
        if (nameUpper.includes(' WIDE')) {
            return 'Wide';
        }

        // Helper: does sizeStr OR skuUpper match this regex?
        var has = function(re) { return re.test(sizeStr) || re.test(skuUpper); };

        if (isWomen) {
            // Women: 2A/AA < B(std) < D < 2E/EE < 4E/EEEE
            if (has(/\b(4E|EEEE)\b/) || sizeStr.includes('EEEE') || skuUpper.includes('EEEE')) return 'Extra Wide';
            if (has(/\b(2E|EE)\b/)   || sizeStr.includes('2E')   || skuUpper.includes('2E'))   return 'Extra Wide'; // women 2E = extra wide
            if (has(/\bD\b/)         || sizeStr.endsWith('D'))                                   return 'Wide';      // women D = wide
            if (has(/\b(2A|AA)\b/)   || sizeStr.endsWith('2A'))                                  return 'Narrow';
            // B = standard, no suffix
        } else {
            // Men: B < D(std) < 2E/EE < 4E/EEEE < 6E/EEEEEE
            if (has(/\b(6E|EEEEEE)\b/) || sizeStr.includes('EEEEEE') || skuUpper.includes('EEEEEE')) return 'Extra Extra Wide';
            if (has(/\b(4E|EEEE)\b/)   || sizeStr.includes('EEEE')   || skuUpper.includes('EEEE'))   return 'Extra Wide';
            if (has(/\b(2E|EE)\b/)     || sizeStr.includes('2E')     || skuUpper.includes('2E'))     return 'Wide';
            if (has(/\bB\b/))                                                                          return 'Narrow';
            // D = standard, no suffix
        }
        return 'Regular';
    },

    // ========== WIDTH LABEL -> HANDLE SUFFIX ==========
    widthSuffix: function(width) {
        switch (width) {
            case 'Narrow':           return '-narrow';
            case 'Wide':             return '-wide';
            case 'Extra Wide':       return '-extra-wide';
            case 'Extra Extra Wide': return '-extra-extra-wide';
            default:                 return '';
        }
    },

    // ========== WIDTH LABEL -> WIDTH CODE (for getProductHandle) ==========
    widthToCode: function(width) {
        switch (width) {
            case 'Narrow':           return 'B';
            case 'Wide':             return 'EE';
            case 'Extra Wide':       return 'EEEE';
            case 'Extra Extra Wide': return 'EEEEEE';
            default:                 return '';
        }
    },

    isAvailableNow: function(availableDateStr) {
        if (!availableDateStr) return true;
        try {
            var parts = availableDateStr.toString().split('/').map(function(num) { return parseInt(num); });
            var availableDate = new Date(parts[2], parts[0] - 1, parts[1]);
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            return availableDate <= today;
        } catch (e) {
            console.warn('Could not parse available date:', availableDateStr);
            return true;
        }
    },

    productInfo: {
        'Mach 6': { description: 'Behold the lightest, most responsive Mach to date.', specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' }, category: 'neutral daily trainer' },
        'Mach 7': { description: 'The lightest, most responsive Mach yet.', specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' }, category: 'neutral daily trainer' },
        'Mach X 3': { description: 'A plated daily trainer that brings the heat to speedwork.', specs: { stack: '38/33mm', drop: '5mm', weight: '10.2 oz' }, category: 'plated performance trainer' },
        'Skyward X': { description: 'Pushing soft and smooth to the extreme with a convex carbon fiber plate.', specs: { stack: '48/43mm', drop: '5mm', weight: '11.3 oz' }, category: 'max cushion trainer' },
        'Clifton 10': { description: 'A trusted trainer for daily maintenance miles.', specs: { stack: '42/34mm', drop: '8mm', weight: '9.7 oz' }, category: 'neutral cushioned trainer' },
        'Bondi 9': { description: 'One of the hardest working shoes in the HOKA lineup.', specs: { stack: '43/38mm', drop: '5mm', weight: '10.5 oz' }, category: 'max cushion trainer' },
        'Arahi 8': { description: 'Anything but your average stability shoe with H-frame technology.', specs: { stack: '39/31mm', drop: '8mm', weight: '9.8 oz' }, category: 'stability trainer' },
        'Skyflow': { description: 'Designed to elevate your daily running practice.', specs: { stack: '40/35mm', drop: '5mm', weight: '10 oz' }, category: 'neutral daily trainer' },
        'Gaviota 5': { description: 'Maximum stability meets plush comfort.', specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' }, category: 'max stability trainer' },
        'Gaviota 6': { description: 'Maximum stability meets plush comfort with enhanced H-Frame technology.', specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' }, category: 'max stability trainer' },
        'Transport': { description: 'The perfect everyday shoe from trail to town.', specs: { stack: '38/33mm', drop: '5mm', weight: '11.5 oz' }, category: 'lifestyle/casual' },
        'Transport Chukka': { description: 'Elevated style meets everyday comfort.', specs: { stack: '38/33mm', drop: '5mm', weight: '12 oz' }, category: 'lifestyle/casual' },
        'Transport GTX': { description: 'Weather-ready versatility with GORE-TEX protection.', specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' }, category: 'lifestyle/casual' },
        'Transport Hike': { description: 'Trail-ready comfort with enhanced support and traction.', specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' }, category: 'lifestyle/hiking' },
        'Transport Mid': { description: 'Ankle support meets everyday comfort.', specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' }, category: 'lifestyle/casual' },
        'Solimar': { description: 'A lightweight, responsive trainer for faster-paced runs.', specs: { stack: '30/25mm', drop: '5mm', weight: '7.2 oz' }, category: 'lightweight performance trainer' },
        'Speedgoat 6': { description: 'Trail icon with unmatched traction on technical terrain.', specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' }, category: 'trail running' },
        'Speedgoat 7': { description: 'The ultimate trail shoe with enhanced traction and improved durability.', specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' }, category: 'trail running' },
        'Speedgoat 6 GTX': { description: 'Waterproof trail running with GORE-TEX protection and Vibram Megagrip outsole.', specs: { stack: '33/29mm', drop: '4mm', weight: '10.8 oz' }, category: 'waterproof trail running' },
        'Speedgoat 6 Mid GTX': { description: 'Mid-cut waterproof trail shoe with ankle protection and aggressive traction.', specs: { stack: '33/29mm', drop: '4mm', weight: '12.1 oz' }, category: 'waterproof trail running' },
        'Bondi SR': { description: 'Slip-resistant version of the iconic Bondi, designed for professionals on their feet all day.', specs: { stack: '43/38mm', drop: '5mm', weight: '11.2 oz' }, category: 'work/slip-resistant' },
        'Arahi SR': { description: 'Slip-resistant stability shoe for all-day comfort and support on the job.', specs: { stack: '39/31mm', drop: '8mm', weight: '10.5 oz' }, category: 'work/slip-resistant' },
        'Challenger 8': { description: 'Versatile road-to-trail shoe with a responsive midsole and durable outsole.', specs: { stack: '33/29mm', drop: '4mm', weight: '9.3 oz' }, category: 'road-to-trail' },
        'Challenger 8 GTX': { description: 'Waterproof road-to-trail shoe with GORE-TEX protection.', specs: { stack: '33/29mm', drop: '4mm', weight: '10.2 oz' }, category: 'waterproof road-to-trail' },
        'Solimar 2': { description: 'Updated lightweight trainer for faster-paced runs with improved responsiveness.', specs: { stack: '30/25mm', drop: '5mm', weight: '7.2 oz' }, category: 'lightweight performance trainer' },
        'Clifton 9 GTX': { description: 'Waterproof daily trainer with GORE-TEX protection and signature Clifton cushioning.', specs: { stack: '39/31mm', drop: '8mm', weight: '10.5 oz' }, category: 'waterproof daily trainer' },
        'Stinson 7': { description: 'Maximum cushion trail shoe for long adventures on moderate terrain.', specs: { stack: '40/35mm', drop: '5mm', weight: '11.5 oz' }, category: 'max cushion trail' },
        'Mafate X': { description: 'Premium trail running shoe with plated midsole for aggressive terrain.', specs: { stack: '35/30mm', drop: '5mm', weight: '10.5 oz' }, category: 'premium trail' },
        'Mafate 5': { description: 'Legendary trail shoe built for rugged terrain with maximum protection.', specs: { stack: '35/30mm', drop: '5mm', weight: '11.2 oz' }, category: 'premium trail' },
        'Tecton X 3': { description: 'Carbon-plated trail racing shoe for competitive trail runners.', specs: { stack: '32/27mm', drop: '5mm', weight: '8.9 oz' }, category: 'trail racing' },
        'Skyward Laceless': { description: 'Easy on/off max cushion shoe with laceless design and plush comfort.', specs: { stack: '48/43mm', drop: '5mm', weight: '11.5 oz' }, category: 'max cushion laceless' },
        'Skyward X 2': { description: 'Next generation max cushion plated trainer with enhanced suspension system.', specs: { stack: '48/43mm', drop: '5mm', weight: '11.3 oz' }, category: 'max cushion trainer' },
        'Transport 2': { description: 'Updated everyday lifestyle shoe for seamless trail-to-town transitions.', specs: { stack: '38/33mm', drop: '5mm', weight: '11.5 oz' }, category: 'lifestyle/casual' },
        'Transport Chukka GTX': { description: 'Waterproof mid-height casual shoe with GORE-TEX and HOKA cushioning.', specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' }, category: 'lifestyle/casual' },
        'Transport Hike GTX': { description: 'Waterproof hiking shoe with enhanced traction and HOKA cushioning.', specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' }, category: 'lifestyle/hiking' },
        'Cielo X1 2.0': { description: 'Elite carbon-plated super shoe for road racing. Second generation Cielo X1.', specs: { stack: '39/36mm', drop: '3mm', weight: '6.2 oz' }, category: 'elite carbon road racer' },
        'Cielo X1 3.0': { description: 'Third generation elite carbon road racer with refined geometry.', specs: { stack: '39/36mm', drop: '3mm', weight: '6.2 oz' }, category: 'elite carbon road racer' },
        'Rocket X 3': { description: 'Carbon-plated road racing shoe for race day performance.', specs: { stack: '38/33mm', drop: '5mm', weight: '7.5 oz' }, category: 'carbon road racer' },
        'Zinal 3': { description: 'Lightweight trail racing shoe for fast and technical terrain.', specs: { stack: '28/24mm', drop: '4mm', weight: '8.5 oz' }, category: 'trail racing' }
    },

    defaultProducts: [],
    selectedProducts: new Set(),

    productCategories: {
        'Road Running': ['Mach 6', 'Mach 7', 'Mach X 3', 'Skyward X', 'Skyward X 2', 'Skyward Laceless',
                         'Clifton 10', 'Clifton 9 GTX', 'Bondi 9', 'Bondi SR', 'Arahi 8', 'Arahi 7', 'Arahi SR',
                         'Skyflow', 'Gaviota 5', 'Gaviota 6', 'Solimar', 'Solimar 2', 'Mach X 2'],
        'Trail Running': ['Speedgoat 6', 'Speedgoat 6 GTX', 'Speedgoat 6 Mid GTX', 'Speedgoat 7',
                          'Speedgoat 5 GTX Spike', 'Challenger 8', 'Challenger 8 GTX', 'Challenger ATR 7',
                          'Challenger ATR 7 GTX', 'Stinson 7', 'Mafate X', 'Mafate 5', 'Mafate Hike',
                          'Mafate X Hike', 'Tecton X 3', 'Zinal 3'],
        'Race / Track': ['Cielo X1 2.0', 'Cielo X1 3.0', 'Cielo X MD', 'Cielo X 3 MD', 'Cielo X 3 LD',
                         'Cielo X LD', 'Cielo RD', 'Cielo Flyx', 'Cielo Flyx Elite', 'Cielo Flyx Lite',
                         'Rocket X 3', 'Rocket X 2', 'Rocket X Trail',
                         'Crescendo MD 2', 'Crescendo XC', 'Crescendo XC Spikeless'],
        'Lifestyle / Hike': ['Transport', 'Transport 2', 'Transport X', 'Transport Chukka', 'Transport Chukka GTX',
                             'Transport GTX', 'Transport Hike', 'Transport Hike GTX', 'Transport Mid',
                             'Clifton L Suede', 'Hopara 2', 'Anacapa 2 Freedom', 'Anacapa 2 Low GTX',
                             'Anacapa 2 Mid GTX', 'Anacapa Breeze Low', 'Anacapa Breeze Mid',
                             'Infini Hike TC', 'Kaha 2 Frost Moc GTX', 'Kaha 3 GTX', 'Kaha 3 Low GTX',
                             'Restore TC'],
        'Recovery': ['Ora Recovery Flip', 'Ora Recovery Mule', 'Ora Recovery Slide 3',
                     'Ora Slide 3 BP', 'Ora Slide 3 Camo'],
        'Accessories': ['Bondi Quarter Run Sock', 'Clifton Crew Run Sock', 'Crew Run Sock 3-Pack',
                        'Invisible Sock 3 Pk', 'No-Show Run Sock', 'No-Show Run Sock 3-Pack',
                        'Quarter Run Sock', 'Quarter Run Sock 3-Pack', 'Race Day Crew Sock',
                        'Trail Run Crew Sock']
    },

    identifyProduct: function(productName) {
        if (!productName) return null;
        var known = this.getMatchingProduct(productName);
        if (known) return known;
        var nameLower = productName.toString().trim().toLowerCase();
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');
        nameLower = nameLower.replace(/\s+(?:x-wide|xwide)$/i, '').replace(/\s+wide$/i, '').trim();
        var titleCased = nameLower.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        titleCased = titleCased.replace(/\bGtx\b/g, 'GTX').replace(/\bSr\b/g, 'SR').replace(/\bAtr\b/g, 'ATR')
                               .replace(/\bMd\b/g, 'MD').replace(/\bLd\b/g, 'LD').replace(/\bXc\b/g, 'XC')
                               .replace(/\bBp\b/g, 'BP').replace(/\bTc\b/g, 'TC').replace(/\bPk\b/g, 'Pk')
                               .replace(/\bOra\b/g, 'Ora');
        return titleCased;
    },

    scanFile: function(file) {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                var reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        var data = [];
                        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                            var workbook = XLSX.read(e.target.result);
                            var worksheet = workbook.Sheets[workbook.SheetNames[0]];
                            data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        } else {
                            var parseResult = Papa.parse(e.target.result, { delimiter: '\t', header: false, skipEmptyLines: true, dynamicTyping: true });
                            data = parseResult.data;
                        }
                        var startIdx = 0;
                        if (data.length > 0 && (data[0][0] === 'Division' || data[0][5] === 'Style Name' || data[0][5] === 'Product Name')) {
                            startIdx = 1;
                        }
                        var productMap = {};
                        var knownSet = self._knownProducts || null;
                        for (var i = startIdx; i < data.length; i++) {
                            var row = data[i];
                            if (!row || row.length < 10) continue;
                            var division = row[0];
                            if (division && (division.toString().trim().toLowerCase() === 'youth' ||
                                            division.toString().trim().toLowerCase() === 'kids' ||
                                            division.toString().trim().toUpperCase() === 'Y')) continue;
                            var identified = self.identifyProduct(row[5]);
                            if (!identified) continue;
                            if (!productMap[identified]) {
                                var isKnown = knownSet ? knownSet.has(identified) : self.defaultProducts.indexOf(identified) !== -1;
                                productMap[identified] = { name: identified, rows: 0, inventory: 0, isDefault: isKnown };
                            }
                            productMap[identified].rows++;
                            var qty = parseInt(row[12]) || 0;
                            if (qty > 0) productMap[identified].inventory += qty;
                        }
                        var products = Object.values(productMap).sort(function(a, b) {
                            if (a.isDefault && !b.isDefault) return -1;
                            if (!a.isDefault && b.isDefault) return 1;
                            return a.name.localeCompare(b.name);
                        });
                        resolve(products);
                    } catch (error) { reject(error); }
                };
                reader.onerror = function() { reject(new Error('Failed to read file')); };
                if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.readAsText(file);
                }
            } catch (error) { reject(error); }
        });
    },

    getMatchingProduct: function(productName) {
        if (!productName) return null;
        var nameLower = productName.toLowerCase();
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');
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
                return null;
            }
            if (nameBase.includes('mach 7') || nameBase.includes('mach7')) return 'Mach 7';
            if (nameBase.includes('mach 6') || nameBase.includes('mach6')) return 'Mach 6';
            return null;
        }
        if (nameBase.includes('speedgoat')) {
            if (nameBase.includes('speedgoat 7') || nameBase.includes('speedgoat7')) return 'Speedgoat 7';
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
            if (nameBase.includes('chukka') && nameBase.includes('gtx')) return 'Transport Chukka GTX';
            if (nameBase.includes('chukka')) return 'Transport Chukka';
            if (nameBase.includes('hike') && nameBase.includes('gtx')) return 'Transport Hike GTX';
            if (nameBase.includes('hike')) return 'Transport Hike';
            if (nameBase.includes('mid')) return 'Transport Mid';
            if (nameBase.includes('gtx')) return 'Transport GTX';
            if (nameBase.includes('transport x')) return 'Transport X';
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
            if (nameBase.includes('cielo x1')) return 'Cielo X1 3.0';
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
            if (nameBase.includes('mafate x hike')) return 'Mafate X Hike';
            if (nameBase.includes('mafate x')) return 'Mafate X';
            if (nameBase.includes('mafate hike')) return 'Mafate Hike';
            if (nameBase.includes('mafate 5') || nameBase.includes('mafate5')) return 'Mafate 5';
            return null;
        }
        if (nameBase.includes('solimar')) {
            if (nameBase.includes('solimar 2') || nameBase.includes('solimar2')) return 'Solimar 2';
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
        return 'Unisex';
    },

    formatGenderForHandle: function(gender) {
        if (!gender) return 'unisex';
        var g = gender.toString().toLowerCase();
        if (g.includes('men') && !g.includes('women')) return 'mens';
        if (g.includes('women')) return 'womens';
        return 'unisex';
    },

    // ========== SMART HANDLE GENERATION ==========
    getProductHandle: function(lookupKey, matchingProduct, colorway, gender, widthLabel) {
        if (this.existingHandles[lookupKey]) {
            return this.existingHandles[lookupKey];
        }
        var genderPrefix = this.formatGenderForHandle(gender);
        var baseHandle = ('hoka-' + genderPrefix + '-' + matchingProduct + '-' + colorway)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return baseHandle + this.widthSuffix(widthLabel);
    },

    convert: function(file) {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                var reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        var data = [];
                        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                            var workbook = XLSX.read(e.target.result);
                            var worksheet = workbook.Sheets[workbook.SheetNames[0]];
                            data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        } else {
                            var parseResult = Papa.parse(e.target.result, { delimiter: '\t', header: false, skipEmptyLines: true, dynamicTyping: true });
                            data = parseResult.data;
                        }
                        var startIdx = 0;
                        if (data.length > 0 && (data[0][0] === 'Division' || data[0][5] === 'Style Name' || data[0][5] === 'Product Name')) {
                            startIdx = 1;
                        }

                        var filteredProducts = data.slice(startIdx).filter(function(row) {
                            if (!row || row.length < 10) return false;
                            var division = row[0];
                            if (division && (division.toString().trim().toLowerCase() === 'youth' ||
                                            division.toString().trim().toLowerCase() === 'kids' ||
                                            division.toString().trim().toUpperCase() === 'Y')) return false;
                            var identified = self.identifyProduct(row[5]);
                            return identified && self.selectedProducts.has(identified);
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

                            var isFutureDate = !self.isAvailableNow(availableDate);
                            var matchingProduct = self.identifyProduct(productName);
                            if (!matchingProduct || !self.selectedProducts.has(matchingProduct)) continue;

                            // Determine gender from product name prefix
                            var formattedGender;
                            var namePrefix = productName.toString().trim().charAt(0).toUpperCase();
                            if (namePrefix === 'U') formattedGender = 'Unisex';
                            else if (namePrefix === 'M') formattedGender = "Men's";
                            else if (namePrefix === 'W') formattedGender = "Women's";
                            else formattedGender = self.formatGender(division);

                            // Clean up size string
                            var size = sizeInfo ? sizeInfo.toString().replace(/[A-Z]/g, '') : '';
                            if (size) {
                                size = size.replace(/^0/, '');
                                if (size.includes('/')) size = size.split('/')[0];
                                size = size.replace(/^0/, '');
                                if (!size.includes('.')) size = size + '.0';
                            }

                            // ========== CORRECTED WIDTH DETECTION ==========
                            var isWomen = formattedGender === "Women's";
                            var width = self.detectWidth(sizeInfo, variantSKU, productName, isWomen);

                            var variantKey = formattedGender + '-' + matchingProduct + '-' + colorway + '-' + size + '-' + width;

                            var actualQuantity = 0;
                            if (isFutureDate) {
                                actualQuantity = 0;
                            } else if (typeof quantity === 'string') {
                                actualQuantity = quantity.includes('+') ? (parseInt(quantity.replace('+', '')) || 100) : (parseInt(quantity) || 0);
                            } else if (typeof quantity === 'number') {
                                actualQuantity = quantity;
                            }

                            if (processedVariants.has(variantKey)) {
                                processedVariants.get(variantKey).quantity += actualQuantity;
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
                            var dA = a[1], dB = b[1];
                            if (dA.matchingProduct !== dB.matchingProduct) return dA.matchingProduct.localeCompare(dB.matchingProduct);
                            if (dA.gender !== dB.gender) {
                                if (dA.gender === "Men's") return -1;
                                if (dB.gender === "Men's") return 1;
                                return dA.gender.localeCompare(dB.gender);
                            }
                            if (dA.colorway !== dB.colorway) return dA.colorway.localeCompare(dB.colorway);
                            if (dA.width !== dB.width) {
                                if (dA.width === 'Regular') return -1;
                                if (dB.width === 'Regular') return 1;
                                return dA.width.localeCompare(dB.width);
                            }
                            return (parseFloat(dA.size) || 0) - (parseFloat(dB.size) || 0);
                        });

                        var shopifyInventory = [];
                        for (var j = 0; j < sortedVariants.length; j++) {
                            var variantData = sortedVariants[j][1];
                            var productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;
                            var skuParts = variantData.variantSKU.split('-');
                            var lookupKey = skuParts[0] + '-' + skuParts[1];
                            var handle = self.getProductHandle(lookupKey, variantData.matchingProduct, variantData.colorway, variantData.gender, variantData.width);
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
                                'On hand (new)': variantData.quantity,
                                _matchingProduct: variantData.matchingProduct
                            });
                        }

                        self.inventoryData = shopifyInventory;
                        self.productVariantData = sortedVariants;
                        resolve(shopifyInventory);
                    } catch (error) { console.error('HOKA conversion error:', error); reject(error); }
                };
                reader.onerror = function() { reject(new Error('Failed to read file')); };
                if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.readAsText(file);
                }
            } catch (error) { console.error('HOKA conversion error:', error); reject(error); }
        });
    },

    generateInventoryCSV: function() {
        if (typeof Papa !== 'undefined') {
            return Papa.unparse(this.inventoryData, { quotes: true, quoteChar: '"', delimiter: ',' });
        }
        var inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
                       '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
                       '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
                       '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
        var csvRows = [inventoryHeaders.join(',')];
        this.inventoryData.forEach(function(row) {
            csvRows.push([
                row.Handle, '"' + row.Title.replace(/"/g, '""') + '"',
                row['Option1 Name'], row['Option1 Value'],
                row['Option2 Name'] || '', row['Option2 Value'] || '',
                row['Option3 Name'] || '', row['Option3 Value'] || '',
                row.SKU, row.Barcode || '', '', '', row.Location, '', '', '', '', '', '',
                row['On hand (new)']
            ].join(','));
        });
        return csvRows.join('\n');
    },

    productVariantData: [],

    _buildProductCSVRows: function(productGroups) {
        var self = this;
        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status', 'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display', 'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL', 'Gift card',
            'SEO title', 'SEO description', 'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category', 'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)', 'Google Shopping / Ad group name',
            'Google Shopping / Ads labels', 'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3', 'Google Shopping / Custom label 4'
        ];

        var csvRows = [];
        productGroups.forEach(function(product) {
            var info = self.productInfo[product.matchingProduct] || {};
            var description = self.buildProductDescription(product.matchingProduct, info);
            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';
            var tags = ['HOKA', product.matchingProduct];
            if (product.gender !== 'Unisex') tags.push(product.gender.replace("'s", ''));
            if (info.category) tags.push(info.category);
            if (product.width && product.width !== 'Regular') tags.push(product.width);
            var price = '';
            var rawPrice = product.retail || (product.variants.length > 0 ? product.variants[0].retail : '');
            if (rawPrice) {
                var p = parseFloat(String(rawPrice).replace(/[$,\s]/g, ''));
                if (!isNaN(p)) price = p.toFixed(2);
            }
            var productType = product.gender === "Men's" ? "Men's Shoes" : product.gender === "Women's" ? "Women's Shoes" : "Unisex Shoes";
            if (info.category && (info.category.includes('sock') || info.category.includes('accessor'))) productType = 'Accessories';

            product.variants.forEach(function(variant, idx) {
                var row = {};
                if (idx === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = description;
                    row['Vendor'] = 'HOKA';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = product.title;
                    row['SEO description'] = (info.description || product.title).substring(0, 320);
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.matchingProduct;
                } else {
                    row['URL handle'] = product.handle;
                }
                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.upc;
                row['Price'] = price;
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Weight value (grams)'] = '';
                row['Weight unit for display'] = '';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';
                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',');
        var lines = [headerLine];
        csvRows.forEach(function(row) {
            lines.push(headers.map(function(h) {
                return '"' + (row[h] !== undefined ? String(row[h]) : '').replace(/"/g, '""') + '"';
            }).join(','));
        });
        return lines.join('\n');
    },

    _buildProductGroups: function(variantDataArray, handleFilter) {
        var self = this;
        var productGroups = new Map();
        for (var k = 0; k < variantDataArray.length; k++) {
            var variantData = variantDataArray[k][1];
            var skuParts = variantData.variantSKU.split('-');
            var lookupKey = skuParts[0] + '-' + skuParts[1];
            var handle = self.getProductHandle(lookupKey, variantData.matchingProduct, variantData.colorway, variantData.gender, variantData.width);
            if (handleFilter && !handleFilter.has(handle)) continue;
            var productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;
            var hasWidth = variantData.width !== 'Regular';
            var finalTitle = productTitle + (hasWidth ? ' (' + variantData.width + ')' : '');
            if (!productGroups.has(handle)) {
                productGroups.set(handle, {
                    handle: handle, title: finalTitle,
                    matchingProduct: variantData.matchingProduct,
                    gender: variantData.gender, colorway: variantData.colorway,
                    retail: variantData.retail, width: variantData.width, variants: []
                });
            }
            productGroups.get(handle).variants.push({
                size: variantData.size, sku: variantData.variantSKU,
                upc: variantData.upc || '', quantity: variantData.quantity, retail: variantData.retail
            });
        }
        return productGroups;
    },

    // ========== SHOPIFY PRODUCT CSV GENERATION ==========
    // Generates CSV for creating NEW products in Shopify (not inventory updates)
    productVariantData: [],

    generateProductCSV: function() {
        if (!this.productVariantData || this.productVariantData.length === 0) {
            return null;
        }

        var self = this;
        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status',
            'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item',
            'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card',
            'SEO title', 'SEO description',
            'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category',
            'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)',
            'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
            'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
            'Google Shopping / Custom label 4'
        ];

        var productGroups = new Map();

        for (var j = 0; j < this.productVariantData.length; j++) {
            var variantData = this.productVariantData[j][1];

            var productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;
            var skuParts = variantData.variantSKU.split('-');
            var lookupKey = skuParts[0] + '-' + skuParts[1];

            var handle = self.getProductHandle(lookupKey, variantData.matchingProduct, variantData.colorway, variantData.gender, variantData.width);

            var hasWidth = variantData.width !== 'Regular';
            var finalTitle = productTitle + (hasWidth ? ' (' + variantData.width + ')' : '');

            if (!productGroups.has(handle)) {
                productGroups.set(handle, {
                    handle: handle,
                    title: finalTitle,
                    matchingProduct: variantData.matchingProduct,
                    gender: variantData.gender,
                    colorway: variantData.colorway,
                    retail: variantData.retail,
                    width: variantData.width,
                    variants: []
                });
            }

            productGroups.get(handle).variants.push({
                size: variantData.size,
                sku: variantData.variantSKU,
                upc: variantData.upc || '',
                quantity: variantData.quantity,
                retail: variantData.retail
            });
        }

        var csvRows = [];

        productGroups.forEach(function(product) {
            var info = self.productInfo[product.matchingProduct] || {};
            var description = self.buildProductDescription(product.matchingProduct, info);

            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var tags = ['HOKA', product.matchingProduct];
            if (product.gender !== 'Unisex') tags.push(product.gender.replace("'s", ''));
            if (info.category) tags.push(info.category);
            if (product.width && product.width !== 'Regular') tags.push(product.width);

            var price = '';
            if (product.retail) {
                var priceStr = String(product.retail).replace(/[$,\s]/g, '');
                price = parseFloat(priceStr);
                if (isNaN(price)) price = '';
                else price = price.toFixed(2);
            }
            if (!price && product.variants.length > 0 && product.variants[0].retail) {
                var priceStr2 = String(product.variants[0].retail).replace(/[$,\s]/g, '');
                price = parseFloat(priceStr2);
                if (isNaN(price)) price = '';
                else price = price.toFixed(2);
            }

            var productType = "Unisex Shoes";
            if (info.category) {
                var cat = info.category.toLowerCase();
                if (cat.includes('sock') || cat.includes('accessor')) {
                    productType = 'Accessories';
                } else if (product.gender === "Men's") {
                    productType = "Men's Shoes";
                } else if (product.gender === "Women's") {
                    productType = "Women's Shoes";
                }
            } else {
                if (product.gender === "Men's") productType = "Men's Shoes";
                else if (product.gender === "Women's") productType = "Women's Shoes";
            }

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = description;
                    row['Vendor'] = 'HOKA';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = product.title;
                    row['SEO description'] = (info.description || product.title).substring(0, 320);
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.matchingProduct;
                } else {
                    row['URL handle'] = product.handle;
                }

                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.upc;
                row['Price'] = price;
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Weight value (grams)'] = '';
                row['Weight unit for display'] = '';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';

                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '\\"') + '"'; }).join(',');
        var lines = [headerLine];

        csvRows.forEach(function(row) {
            var values = headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '\\"') + '"';
            });
            lines.push(values.join(','));
        });

        return lines.join('\n');
    },

    // Build HTML product description from productInfo
    buildProductDescription: function(productName, info) {
        if (!info || !info.description) return '';

        var html = '<p>' + info.description + '</p>';

        if (info.specs) {
            html += '<ul>';
            if (info.specs.stack) html += '<li>Stack Height: ' + info.specs.stack + '</li>';
            if (info.specs.drop) html += '<li>Heel-Toe Drop: ' + info.specs.drop + '</li>';
            if (info.specs.weight) html += '<li>Weight: ' + info.specs.weight + '</li>';
            html += '</ul>';
        }

        return html;
    },

    // ========== NEW PRODUCT CSV (ONLY NEW COLORWAYS/PRODUCTS) ==========
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;
        var self = this;

        var newHandles = new Set();
        if (comparison.newProducts) {
            for (var i = 0; i < comparison.newProducts.length; i++) {
                newHandles.add(comparison.newProducts[i].handle);
            }
        }
        if (comparison.newColorways) {
            for (var j = 0; j < comparison.newColorways.length; j++) {
                newHandles.add(comparison.newColorways[j].handle);
            }
        }

        if (newHandles.size === 0) return null;
        if (!this.productVariantData || this.productVariantData.length === 0) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status',
            'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item',
            'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card',
            'SEO title', 'SEO description',
            'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category',
            'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)',
            'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
            'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
            'Google Shopping / Custom label 4'
        ];

        var productGroups = new Map();

        for (var k = 0; k < this.productVariantData.length; k++) {
            var variantData = this.productVariantData[k][1];
            var productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;
            var skuParts = variantData.variantSKU.split('-');
            var lookupKey = skuParts[0] + '-' + skuParts[1];

            var handle = self.getProductHandle(lookupKey, variantData.matchingProduct, variantData.colorway, variantData.gender, variantData.width);

            if (!newHandles.has(handle)) continue;

            var hasWidth = variantData.width !== 'Regular';
            var finalTitle = productTitle + (hasWidth ? ' (' + variantData.width + ')' : '');

            if (!productGroups.has(handle)) {
                productGroups.set(handle, {
                    handle: handle, title: finalTitle,
                    matchingProduct: variantData.matchingProduct,
                    gender: variantData.gender, colorway: variantData.colorway,
                    retail: variantData.retail, width: variantData.width,
                    variants: []
                });
            }

            productGroups.get(handle).variants.push({
                size: variantData.size, sku: variantData.variantSKU,
                upc: variantData.upc || '', quantity: variantData.quantity,
                retail: variantData.retail
            });
        }

        if (productGroups.size === 0) return null;

        var csvRows = [];

        productGroups.forEach(function(product) {
            var info = self.productInfo[product.matchingProduct] || {};
            var description = self.buildProductDescription(product.matchingProduct, info);

            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var tags = ['HOKA', product.matchingProduct];
            if (product.gender !== 'Unisex') tags.push(product.gender.replace("'s", ''));
            if (info.category) tags.push(info.category);
            if (product.width && product.width !== 'Regular') tags.push(product.width);

            var price = '';
            if (product.retail) {
                var priceStr = String(product.retail).replace(/[$,\s]/g, '');
                price = parseFloat(priceStr);
                if (isNaN(price)) price = '';
                else price = price.toFixed(2);
            }
            if (!price && product.variants.length > 0 && product.variants[0].retail) {
                var priceStr2 = String(product.variants[0].retail).replace(/[$,\s]/g, '');
                price = parseFloat(priceStr2);
                if (isNaN(price)) price = '';
                else price = price.toFixed(2);
            }

            var productType = "Unisex Shoes";
            if (info.category) {
                var cat = info.category.toLowerCase();
                if (cat.includes('sock') || cat.includes('accessor')) {
                    productType = 'Accessories';
                } else if (product.gender === "Men's") {
                    productType = "Men's Shoes";
                } else if (product.gender === "Women's") {
                    productType = "Women's Shoes";
                }
            } else {
                if (product.gender === "Men's") productType = "Men's Shoes";
                else if (product.gender === "Women's") productType = "Women's Shoes";
            }

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = description;
                    row['Vendor'] = 'HOKA';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = product.title;
                    row['SEO description'] = (info.description || product.title).substring(0, 320);
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.matchingProduct;
                } else {
                    row['URL handle'] = product.handle;
                }

                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.upc;
                row['Price'] = price;
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Weight value (grams)'] = '';
                row['Weight unit for display'] = '';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';

                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '\\"') + '"'; }).join(',');
        var lines = [headerLine];

        csvRows.forEach(function(row) {
            var values = headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '\\"') + '"';
            });
            lines.push(values.join(','));
        });

        return lines.join('\n');
    }
};