/**
 * GENERATED - do not edit.
 *
 * Built by `npm run election:bake` from apps/server/config/election.config.json.
 * Edit that file and rebuild; hand-editing this makes the ballot disagree with
 * the repository about who is standing.
 *
 * 10 contests - 25 candidates
 */
import type { PublicElection } from '../lib/api';

export const BAKED_ELECTION: PublicElection = {
  "election": {
    "id": "mesa-forge-c27",
    "name": "Forge Student Elections",
    "status": "open"
  },
  "houses": [
    {
      "id": "samurai",
      "name": "Samurai",
      "color": "#2F57A8",
      "shape": "circle",
      "crestUrl": "/houses/samurai.png"
    },
    {
      "id": "knights",
      "name": "Knights",
      "color": "#B83325",
      "shape": "square",
      "crestUrl": "/houses/knights.png"
    },
    {
      "id": "gladiators",
      "name": "Gladiators",
      "color": "#628838",
      "shape": "arc",
      "crestUrl": "/houses/gladiators.png"
    },
    {
      "id": "vikings",
      "name": "Vikings",
      "color": "#EEC048",
      "shape": "triangle",
      "crestUrl": "/houses/vikings.png"
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
      "title": "Boys’ Academic Lead",
      "shortTitle": "Boys’ Academic Lead",
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
      "title": "Girls’ Academic Lead",
      "shortTitle": "Girls’ Academic Lead",
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
      "title": "Boys’ Community Lead",
      "shortTitle": "Boys’ Community Lead",
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
      "title": "Girls’ Community Lead",
      "shortTitle": "Girls’ Community Lead",
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
      "title": "Samurai House Captain",
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
      "title": "Knights House Captain",
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
      "title": "Gladiators House Captain",
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
      "title": "Vikings House Captain",
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
  "window": {
    "open": true
  },
  "auth": {
    "mode": "supervised",
    "supportsRollSearch": true,
    "requiresSupervision": true
  },
  "configVersion": "baked-mesa-forge-c27"
} as PublicElection;
