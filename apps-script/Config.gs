/**
 * GENERATED — do not edit.
 *
 * Built by `npm run appsscript:build` from apps/server/config/election.config.json
 * and voters.json. Hand-editing this makes the hosted ballot disagree with the
 * repository about who is standing, and the repository is the source of truth.
 *
 * Generated 2026-09-22T04:50:44.223Z
 * 10 contests · 25 candidates · 145 on the roll
 */

var CONFIG = {
  "election": {
    "id": "mesa-forge-c27",
    "name": "Mesa Student Elections",
    "status": "open",
    "weights": {
      "student": 0.75,
      "employee": 0.25
    },
    "zeroTurnoutPolicy": "renormalise"
  },
  "houses": [
    {
      "id": "samurai",
      "name": "Samurai",
      "color": "#2F57A8",
      "shape": "circle"
    },
    {
      "id": "knights",
      "name": "Knights",
      "color": "#B83325",
      "shape": "square"
    },
    {
      "id": "gladiators",
      "name": "Gladiators",
      "color": "#628838",
      "shape": "arc"
    },
    {
      "id": "vikings",
      "name": "Vikings",
      "color": "#EEC048",
      "shape": "triangle"
    }
  ],
  "positions": [
    {
      "id": "president",
      "title": "President",
      "shortTitle": "President",
      "order": 1,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "vice-president",
      "title": "Vice President",
      "shortTitle": "Vice President",
      "order": 2,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "academic-lead-boy",
      "title": "Academic Lead — Boy",
      "shortTitle": "Academic Lead (Boy)",
      "order": 3,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "academic-lead-girl",
      "title": "Academic Lead — Girl",
      "shortTitle": "Academic Lead (Girl)",
      "order": 4,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "community-lead-boy",
      "title": "Community Lead — Boy",
      "shortTitle": "Community Lead (Boy)",
      "order": 5,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "community-lead-girl",
      "title": "Community Lead — Girl",
      "shortTitle": "Community Lead (Girl)",
      "order": 6,
      "kind": "leadership",
      "eligibility": {
        "voterTypes": [
          "student",
          "employee"
        ]
      }
    },
    {
      "id": "house-captain-samurai",
      "title": "House Captain — Samurai",
      "shortTitle": "Samurai Captain",
      "order": 7,
      "kind": "house-captain",
      "houseId": "samurai",
      "eligibility": {
        "voterTypes": [
          "student"
        ],
        "houseId": "samurai"
      }
    },
    {
      "id": "house-captain-knights",
      "title": "House Captain — Knights",
      "shortTitle": "Knights Captain",
      "order": 8,
      "kind": "house-captain",
      "houseId": "knights",
      "eligibility": {
        "voterTypes": [
          "student"
        ],
        "houseId": "knights"
      }
    },
    {
      "id": "house-captain-gladiators",
      "title": "House Captain — Gladiators",
      "shortTitle": "Gladiators Captain",
      "order": 9,
      "kind": "house-captain",
      "houseId": "gladiators",
      "eligibility": {
        "voterTypes": [
          "student"
        ],
        "houseId": "gladiators"
      }
    },
    {
      "id": "house-captain-vikings",
      "title": "House Captain — Vikings",
      "shortTitle": "Vikings Captain",
      "order": 10,
      "kind": "house-captain",
      "houseId": "vikings",
      "eligibility": {
        "voterTypes": [
          "student"
        ],
        "houseId": "vikings"
      }
    }
  ],
  "candidates": [
    {
      "id": "president--yashansh-savla",
      "name": "Yashansh Savla",
      "positionId": "president",
      "photoUrl": "/candidates/president--yashansh-savla.svg",
      "active": true
    },
    {
      "id": "president--sairaj-g",
      "name": "Sairaj G",
      "positionId": "president",
      "photoUrl": "/candidates/president--sairaj-g.svg",
      "active": true
    },
    {
      "id": "president--abhishek-gaur",
      "name": "Abhishek Gaur",
      "positionId": "president",
      "photoUrl": "/candidates/president--abhishek-gaur.svg",
      "active": true
    },
    {
      "id": "president--itish-pande",
      "name": "Itish Pande",
      "positionId": "president",
      "photoUrl": "/candidates/president--itish-pande.svg",
      "active": true
    },
    {
      "id": "vice-president--preethi-s",
      "name": "Preethi S",
      "positionId": "vice-president",
      "photoUrl": "/candidates/vice-president--preethi-s.svg",
      "active": true
    },
    {
      "id": "vice-president--abhishek-kambalath",
      "name": "Abhishek Kambalath",
      "positionId": "vice-president",
      "photoUrl": "/candidates/vice-president--abhishek-kambalath.svg",
      "active": true
    },
    {
      "id": "vice-president--divyam-arora",
      "name": "Divyam Arora",
      "positionId": "vice-president",
      "photoUrl": "/candidates/vice-president--divyam-arora.svg",
      "active": true
    },
    {
      "id": "academic-lead-boy--adnaan-r",
      "name": "Adnaan R",
      "positionId": "academic-lead-boy",
      "photoUrl": "/candidates/academic-lead-boy--adnaan-r.svg",
      "active": true
    },
    {
      "id": "academic-lead-boy--udhav-kothari",
      "name": "Udhav Kothari",
      "positionId": "academic-lead-boy",
      "photoUrl": "/candidates/academic-lead-boy--udhav-kothari.svg",
      "active": true
    },
    {
      "id": "academic-lead-girl--kalika-srivastava",
      "name": "Kalika Srivastava",
      "positionId": "academic-lead-girl",
      "photoUrl": "/candidates/academic-lead-girl--kalika-srivastava.svg",
      "active": true
    },
    {
      "id": "academic-lead-girl--jenessa-bhathena",
      "name": "Jenessa Bhathena",
      "positionId": "academic-lead-girl",
      "photoUrl": "/candidates/academic-lead-girl--jenessa-bhathena.svg",
      "active": true
    },
    {
      "id": "community-lead-boy--akash-ghorpade",
      "name": "Akash Ghorpade",
      "positionId": "community-lead-boy",
      "photoUrl": "/candidates/community-lead-boy--akash-ghorpade.svg",
      "active": true
    },
    {
      "id": "community-lead-boy--risheet-gangar",
      "name": "Risheet Gangar",
      "positionId": "community-lead-boy",
      "photoUrl": "/candidates/community-lead-boy--risheet-gangar.svg",
      "active": true
    },
    {
      "id": "community-lead-boy--archit-pathak",
      "name": "Archit Pathak",
      "positionId": "community-lead-boy",
      "photoUrl": "/candidates/community-lead-boy--archit-pathak.svg",
      "active": true
    },
    {
      "id": "community-lead-girl--kavya-zala",
      "name": "Kavya Zala",
      "positionId": "community-lead-girl",
      "photoUrl": "/candidates/community-lead-girl--kavya-zala.svg",
      "active": true
    },
    {
      "id": "community-lead-girl--rishika-choudhary",
      "name": "Rishika Choudhary",
      "positionId": "community-lead-girl",
      "photoUrl": "/candidates/community-lead-girl--rishika-choudhary.svg",
      "active": true
    },
    {
      "id": "community-lead-girl--riya-kothavade",
      "name": "Riya Kothavade",
      "positionId": "community-lead-girl",
      "photoUrl": "/candidates/community-lead-girl--riya-kothavade.svg",
      "active": true
    },
    {
      "id": "house-captain-samurai--adnaan-r",
      "name": "Adnaan R",
      "positionId": "house-captain-samurai",
      "photoUrl": "/candidates/house-captain-samurai--adnaan-r.svg",
      "active": true
    },
    {
      "id": "house-captain-samurai--zalak-gogri",
      "name": "Zalak Gogri",
      "positionId": "house-captain-samurai",
      "photoUrl": "/candidates/house-captain-samurai--zalak-gogri.svg",
      "active": true
    },
    {
      "id": "house-captain-knights--preet-jain",
      "name": "Preet Jain",
      "positionId": "house-captain-knights",
      "photoUrl": "/candidates/house-captain-knights--preet-jain.svg",
      "active": true
    },
    {
      "id": "house-captain-knights--arpita-mahata",
      "name": "Arpita Mahata",
      "positionId": "house-captain-knights",
      "photoUrl": "/candidates/house-captain-knights--arpita-mahata.svg",
      "active": true
    },
    {
      "id": "house-captain-vikings--dhyay-amit-popat",
      "name": "Dhyay Amit Popat",
      "positionId": "house-captain-vikings",
      "photoUrl": "/candidates/house-captain-vikings--dhyay-amit-popat.svg",
      "active": true
    },
    {
      "id": "house-captain-vikings--maitree-shah",
      "name": "Maitree Shah",
      "positionId": "house-captain-vikings",
      "photoUrl": "/candidates/house-captain-vikings--maitree-shah.svg",
      "active": true
    },
    {
      "id": "house-captain-gladiators--aarav-shrivastava",
      "name": "Aarav Shrivastava",
      "positionId": "house-captain-gladiators",
      "photoUrl": "/candidates/house-captain-gladiators--aarav-shrivastava.svg",
      "active": true
    },
    {
      "id": "house-captain-gladiators--bhavya-tandon",
      "name": "Bhavya Tandon",
      "positionId": "house-captain-gladiators",
      "photoUrl": "/candidates/house-captain-gladiators--bhavya-tandon.svg",
      "active": true
    }
  ],
  "roll": [
    {
      "id": "stu-abeer-bhati",
      "name": "Abeer Bhati",
      "email": "abeer_bhati@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-aditya-singhal",
      "name": "Aditya Singhal",
      "email": "aditya_singhal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-tejas-joshi",
      "name": "Tejas Joshi",
      "email": "tejas_joshi@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-anshuman-katore",
      "name": "Anshuman Katore",
      "email": "anshuman_katore@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-harsh-nain",
      "name": "Harsh Nain",
      "email": "harsh_nain@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-lipika-arya",
      "name": "Lipika Arya",
      "email": "lipika_arya@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-rydham-jain",
      "name": "Rydham Jain",
      "email": "rydham_jain@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-shashank-pandey",
      "name": "Shashank Pandey",
      "email": "shashank_pandey@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-bhavit-gupta",
      "name": "Bhavit Gupta",
      "email": "bhavit_gupta@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-haider-millwala",
      "name": "Haider Millwala",
      "email": "haider_millwala@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-pratiksha-bengani",
      "name": "Pratiksha Bengani",
      "email": "pratiksha_bengani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-akash-ghorpade",
      "name": "Akash Ghorpade",
      "email": "akash_ghorpade@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-ashutosh-saxena",
      "name": "Ashutosh Saxena",
      "email": "ashutosh_saxena@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-param-deora",
      "name": "Param Deora",
      "email": "param_deora@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-tanishque-jain",
      "name": "Tanishque Jain",
      "email": "tanishque_jain@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-vidhi-agarwal",
      "name": "Vidhi Agarwal",
      "email": "vidhi_agarwal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-ananta-tantia",
      "name": "Ananta Tantia",
      "email": "ananta_tantia@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-anuj-bajaj",
      "name": "Anuj Bajaj",
      "email": "anuj_bajaj@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-diya-agrawal",
      "name": "Diya Agrawal",
      "email": "diya_agrawal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-dhyay-popat",
      "name": "Dhyay Amit Popat",
      "email": "dhyay_popat@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-hritik-gani",
      "name": "Hritik Gani",
      "email": "hritik_gani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-annashri-mahato",
      "name": "Annashri Mahato",
      "email": "annashri_mahato@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-maitree-shah",
      "name": "Maitree Shah",
      "email": "maitree_shah@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-meith-jain",
      "name": "Meith Jain",
      "email": "meith_jain@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-risheet-gangar",
      "name": "Risheet Gangar",
      "email": "risheet_gangar@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-ritesh-oswal",
      "name": "Ritesh Oswal",
      "email": "ritesh_oswal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-riya-khurana",
      "name": "Riya Khurana",
      "email": "riya_khurana@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-rushabh-shah",
      "name": "Rushabh Shah",
      "email": "rushabh_shah@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-sakshi-awasthi",
      "name": "Sakshi Awasthi",
      "email": "sakshi_awasthi@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-yashansh-savla",
      "name": "Yashansh Savla",
      "email": "yashansh_savla@forge27.mesaschool.co",
      "type": "student",
      "houseId": "vikings"
    },
    {
      "id": "stu-aarav-shrivastava",
      "name": "Aarav Shrivastava",
      "email": "aarav_shrivastava@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-rishika-choudhary",
      "name": "Rishika Choudhary",
      "email": "rishika_choudhary@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-tanishq-lomte",
      "name": "Tanishq Lomte",
      "email": "tanishq_lomte@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-akassh-puranik",
      "name": "Akassh Puranik",
      "email": "akassh_puranik@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-devansh-mehta",
      "name": "Devansh Mehta",
      "email": "devansh_mehta@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-naveen-kumar",
      "name": "Naveen Kumar",
      "email": "naveen_kumar@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-rahul-m",
      "name": "Rahul M",
      "email": "rahul_m@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-simran-kalra",
      "name": "Simran Kalra",
      "email": "simran_kalra@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-ansh-loya",
      "name": "Ansh Loya",
      "email": "ansh_loya@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-kavya-zala",
      "name": "Kavya Zala",
      "email": "kavya_zala@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-yashwi-agrawal",
      "name": "Yashwi Agrawal",
      "email": "yashwi_agrawal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-akshat-thakur",
      "name": "Akshat Thakur",
      "email": "akshat_thakur@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-bhavya-tandon",
      "name": "Bhavya Tandon",
      "email": "bhavya_tandon@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-sohum-shikhare",
      "name": "Sohum Shikhare",
      "email": "sohum_shikhare@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-udhav-kothari",
      "name": "Udhav Kothari",
      "email": "udhav_kothari@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-utkarsh-kapoor",
      "name": "Utkarsh Kapoor",
      "email": "utkarsh_kapoor@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-kaavya-goenka",
      "name": "Kaavya Goenka",
      "email": "kaavya_goenka@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-kalika-srivastava",
      "name": "Kalika Srivastava",
      "email": "kalika_srivastava@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-radha-hutkey",
      "name": "Radha Pankaj Hutkey",
      "email": "radha_hutkey@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-madhuresh-binzani",
      "name": "Madhuresh Binzani",
      "email": "madhuresh_binzani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-anshul-dhapte",
      "name": "Anshul Dhapte",
      "email": "anshul_dhapte@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-anushka-ghogre",
      "name": "Anushka Ghogre",
      "email": "anushka_ghogre@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-archit-pathak",
      "name": "Archit Pathak",
      "email": "archit_pathak@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-dev-mehra",
      "name": "Dev Mehra",
      "email": "dev_mehra@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-itish-pande",
      "name": "Itish Pande",
      "email": "itish_pande@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-naveen-kolla",
      "name": "Kolla Naveen",
      "email": "naveen_kolla@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-riya-kothavade",
      "name": "Riya Kothavade",
      "email": "riya_kothavade@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-sahil-agrawal",
      "name": "Sahil Agrawal",
      "email": "sahil_agrawal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-satvik-bansal",
      "name": "Satvik Bansal",
      "email": "satvik_bansal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-shivansh-sarraf",
      "name": "Shivansh Sarraf",
      "email": "shivansh_sarraf@forge27.mesaschool.co",
      "type": "student",
      "houseId": "gladiators"
    },
    {
      "id": "stu-divyam-arora",
      "name": "Divyam Arora",
      "email": "divyam_arora@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-diya-harish",
      "name": "Diya Harish",
      "email": "diya_harish@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-pragati-singh",
      "name": "Pragati Singh",
      "email": "pragati_singh@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-akristi-mohta",
      "name": "Akristi Mohta",
      "email": "akristi_mohta@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-darshan-chopda",
      "name": "Darshan Chopda",
      "email": "darshan_chopda@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-happy-panjwani",
      "name": "Happy Panjwani",
      "email": "happy_panjwani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-pratiksha-bihani",
      "name": "Pratiksha Bihani",
      "email": "pratiksha_bihani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-yogita-bhuwania",
      "name": "Yogita Bhuwania",
      "email": "yogita_bhuwania@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-aadishwar-r",
      "name": "Aadishwar R",
      "email": "aadishwar_r@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-diya-ispahani",
      "name": "Diya Ispahani",
      "email": "diya_ispahani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-mayank-agrawal",
      "name": "Mayank Agrawal",
      "email": "mayank_agrawal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-adnaan-r",
      "name": "Adnaan R",
      "email": "adnaan_r@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-devansh-vora",
      "name": "Devansh Vora",
      "email": "devansh_vora@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-praval-goud",
      "name": "Sai Santosh Praval Goud",
      "email": "praval_goud@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-ujjwal-sitlani",
      "name": "Ujjwal Sitlani",
      "email": "ujjwal_sitlani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-vion-dsouza",
      "name": "Vion D'Souza",
      "email": "vion_dsouza@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-vatsal-shah",
      "name": "Vatsal Shah",
      "email": "vatsal_shah@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-zalak-gogri",
      "name": "Zalak Gogri",
      "email": "zalak_gogri@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-aditya-peter",
      "name": "Aditya Peter",
      "email": "aditya_peter@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-anubhav-rastogi",
      "name": "Anubhav Rastogi",
      "email": "anubhav_rastogi@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-atharva-agrawal",
      "name": "Atharva Agrawal",
      "email": "atharva_agrawal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-brijesh-attal",
      "name": "Brijesh Attal",
      "email": "brijesh_attal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-harsh-dubey",
      "name": "Harsh Dubey",
      "email": "harsh_dubey@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-harsh-malani",
      "name": "Harsh Malani",
      "email": "harsh_malani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-jenessa-bhathena",
      "name": "Jenessa Bhathena",
      "email": "jenessa_bhathena@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-nikhil-kanjolia",
      "name": "Nikhil Kanjolia",
      "email": "nikhil_kanjolia@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-nirmalya-sah",
      "name": "Nirmalya Sah",
      "email": "nirmalya_sah@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-preethi-s",
      "name": "Preethi S",
      "email": "preethi_s@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-sachidananda-dehury",
      "name": "Sachidananda Dehury",
      "email": "sachidananda_dehury@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-somanshu-singhal",
      "name": "Somanshu Singhal",
      "email": "somanshu_singhal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "samurai"
    },
    {
      "id": "stu-arpita-mahata",
      "name": "Arpita Mahata",
      "email": "arpita_mahata@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-rohan-vivek",
      "name": "Rohan B Vivek",
      "email": "rohan_vivek@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-abhishek-kambalath",
      "name": "Abhishek Kambalath",
      "email": "abhishek_kambalath@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-adithya-rajagopalan",
      "name": "Adithya Rajagopalan",
      "email": "adithya_rajagopalan@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-darsh-shah",
      "name": "Darsh Manish Shah",
      "email": "darsh_shah@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-vikram-agarwal",
      "name": "Vikram Aditya Agarwal",
      "email": "vikram_agarwal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-yaswanth-krishna",
      "name": "Yaswanth Krishna",
      "email": "yaswanth_krishna@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-aditya-agarwal",
      "name": "Aditya Agarwal",
      "email": "aditya_agarwal@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-sinchan-rai",
      "name": "Sinchan Rai",
      "email": "sinchan_rai@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-tushar-ram-reddy",
      "name": "Tushar Ram Reddy",
      "email": "tushar_ram_reddy@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-aditi-roy",
      "name": "Aditi Roy",
      "email": "aditi_roy@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-bhadar-singh",
      "name": "Bhadar Singh Namdhari",
      "email": "bhadar_singh@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-divy-hardenia",
      "name": "Divy Hardenia",
      "email": "divy_hardenia@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-parin-kumat",
      "name": "Parin Kumat",
      "email": "parin_kumat@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-sarth-raghuwanshi",
      "name": "Sarth Raghuwanshi",
      "email": "sarth_raghuwanshi@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-rohit-singh",
      "name": "Rohit Singh",
      "email": "rohit_singh@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-sairaj-g",
      "name": "Sairaj G",
      "email": "sairaj_g@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-zuha-fathima",
      "name": "Zuha Fathima",
      "email": "zuha_fathima@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-abhishek-gaur",
      "name": "Abhishek Gaur",
      "email": "abhishek_gaur@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-abhishek-hosmani",
      "name": "Abhishek Hosmani",
      "email": "abhishek_hosmani@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-aditi-bhateja",
      "name": "Aditi Bhateja",
      "email": "aditi_bhateja@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-ajitesh-senthilkumar",
      "name": "Ajitesh Senthilkumar",
      "email": "ajitesh_senthilkumar@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-akhilesh-bijjargi",
      "name": "Akhilesh Bijjargi",
      "email": "akhilesh_bijjargi@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-dhruvi-lohiya",
      "name": "Dhruvi Lohiya",
      "email": "dhruvi_lohiya@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-preet-jain",
      "name": "Preet Jain",
      "email": "preet_jain@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-ridhima-gupta",
      "name": "Ridhima Gupta",
      "email": "ridhima_gupta@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-rishika-uppalapati",
      "name": "Rishika Uppalapati",
      "email": "rishika_uppalapati@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-shweta-singh",
      "name": "Shweta Singh",
      "email": "shweta_singh@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "stu-tanishka-desai",
      "name": "Tanishka N Desai",
      "email": "tanishka_desai@forge27.mesaschool.co",
      "type": "student",
      "houseId": "knights"
    },
    {
      "id": "emp-vedansh",
      "name": "Vedansh",
      "email": "vedansh@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-chandu",
      "name": "Chandu",
      "email": "chandu@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-riya",
      "name": "Riya",
      "email": "riya@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-rakshitha",
      "name": "Rakshitha",
      "email": "rakshitha@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-saurabh",
      "name": "Saurabh",
      "email": "saurabh@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-akshitha",
      "name": "Akshita",
      "email": "akshitha@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-aquib",
      "name": "Aquib",
      "email": "aquib@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-muskaan-narang",
      "name": "Muskaan",
      "email": "muskaan.narang@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-manda",
      "name": "Manda",
      "email": "manda@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-shubhang",
      "name": "Shubhang",
      "email": "shubhang@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-shruti",
      "name": "Shruti",
      "email": "shruti@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-mridula",
      "name": "Mridula",
      "email": "mridula@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-rishi",
      "name": "Rishi",
      "email": "rishi@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-pragati",
      "name": "Pragati",
      "email": "pragati@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-pavan",
      "name": "Pavan",
      "email": "pavan@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-bhashitha",
      "name": "Bhashitha",
      "email": "bhashitha@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-aishani",
      "name": "Aishani",
      "email": "aishani@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-indhuja",
      "name": "Induja",
      "email": "indhuja@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-suhasini",
      "name": "Suhasini",
      "email": "suhasini@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-sruti",
      "name": "Sruti",
      "email": "sruti@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-pragya",
      "name": "Pragya",
      "email": "pragya@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-rachna",
      "name": "Rachna",
      "email": "rachna@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-mobashsherah",
      "name": "Mobashsherah",
      "email": "mobashsherah@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-goutham",
      "name": "Goutham",
      "email": "goutham@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-krishna-jain",
      "name": "Krishna",
      "email": "krishna.jain@mesaschool.co",
      "type": "employee",
      "houseId": null
    },
    {
      "id": "emp-shivangi",
      "name": "Shivangi",
      "email": "shivangi@mesaschool.co",
      "type": "employee",
      "houseId": null
    }
  ]
};
