# Candidate photographs

Drop the photos in this folder. That is the whole job — there is no command
to run and no code to touch.

- **If the app is running**, the photo is cropped and swapped in for that
  candidate's initials within a second or two. You do not need to restart it.
- **If it is not running**, the next `npm run dev` or `npm run build` picks up
  everything waiting in here.
- To convert what is in the folder right now without starting anything:
  `npm run photos:import`

Once a photo has been imported it stays imported. These originals are large
and are of real students, so clearing them out of this folder afterwards is
fine — the converted photo is what ships, and re-running the import will not
undo it.

To take a photo back off the ballot, delete the converted file in
`apps/web/src/assets/candidates/` instead. That candidate goes back to their
initials.

## Naming

Name each file after the candidate. All of these work:

```
Sairaj G.jpg        sairaj-g.jpg        SAIRAJ G.JPEG
Preet Jain.png      preet_jain.webp
```

Matching ignores case, spaces and punctuation, so you do not have to be
precise about it. The import prints anything it could not place, so a typo
shows up immediately rather than silently leaving someone blank.

## What makes a good photo

- **Portrait or square.** The card crops to a wide box, biased upward — faces
  sit high in a portrait, and a centre crop cuts foreheads.
- **At least 600px wide.** Bigger is fine; everything is resized down.
- **Head and shoulders, face roughly centred left to right.**
- JPG, PNG or WebP. Photos straight off a phone are fine — sideways ones are
  rotated automatically.

Do not resize or compress them yourself. The import cover-crops every photo to
the same size and compresses it, so a 4 MB phone picture lands at roughly
50 KB and every card on the ballot looks consistent. Your originals are read,
never modified.

## A partial set is fine

Anyone without a photo keeps their initials placeholder, which looks
deliberate rather than broken. Run the import again each time more arrive —
it is safe to repeat.

---

## The 24 files to collect

25 candidacies, 24 people — Adnaan R. stands for two positions and
needs only one photo.

### President

- `Yashansh Savla.jpg`
- `Sairaj G.jpg`
- `Abhishek Gaur.jpg`
- `Itish Pande.jpg`

### Vice President

- `Preethi S.jpg`
- `Abhishek Kambalath.jpg`
- `Divyam Arora.jpg`

### Academic Lead — Boy

- `Adnaan R.jpg`
- `Udhav Kothari.jpg`

### Academic Lead — Girl

- `Kalika Srivastava.jpg`
- `Jenessa Bhathena.jpg`

### Community Lead — Boy

- `Akash Ghorpade.jpg`
- `Risheet Gangar.jpg`
- `Archit Pathak.jpg`

### Community Lead — Girl

- `Kavya Zala.jpg`
- `Rishika Choudhary.jpg`
- `Riya Kothavade.jpg`

### House Captain — Samurai

- `Adnaan R.jpg` — same file as under Academic Lead — Boy, you only need it once
- `Zalak Gogri.jpg`

### House Captain — Knights

- `Preet Jain.jpg`
- `Arpita Mahata.jpg`

### House Captain — Gladiators

- `Aarav Shrivastava.jpg`
- `Bhavya Tandon.jpg`

### House Captain — Vikings

- `Dhyay Amit Popat.jpg`
- `Maitree Shah.jpg`
