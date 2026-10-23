# Fonts in the PDF index

Both fonts are embedded only when a PDF is exported. Their SIL Open Font Licenses are included here. The application uses the committed static TTFs directly; Python is not needed to build or run RoomTrace.

- `NotoSans-Regular.ttf`: static regular font from `notofonts/noto-fonts`, `hinted/ttf/NotoSans/NotoSans-Regular.ttf`, Git blob `d55220958aa51eeeb85048d746eabe43d2cd9f14`. License: `OFL.txt`.
- `NotoSansDevanagari-Regular.ttf`: Noto Sans Devanagari 2.007, instantiated as a static font from `google/fonts`, `ofl/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf`, Git blob `163f04bddc5a96fc523e4080466cac5c588f6594`. License: `OFL-Devanagari.txt`.

The Devanagari font has fixed axes `wght=400`, `wdth=100`; it contains no `fvar`, `gvar`, `HVAR` or `avar` tables. The older static Noto Sans Devanagari 2.004 triggers fontkit 2.0.4's null-anchor bug for common Hindi and Marathi words, so this newer static instance is used.

To reproduce the static instance, use authenticated `gh` and fontTools 4.65.0:

```text
gh api repos/google/fonts/git/blobs/163f04bddc5a96fc523e4080466cac5c588f6594 --jq .content > font-base64.txt
python -c "import base64,pathlib; pathlib.Path('NotoSansDevanagari-variable.ttf').write_bytes(base64.b64decode(pathlib.Path('font-base64.txt').read_text(encoding='utf-8-sig')))"
python -m fontTools.varLib.instancer NotoSansDevanagari-variable.ttf wght=400 wdth=100 --output NotoSansDevanagari-Regular.ttf
```

Confirm the resulting font has no variation tables:

```text
python -c "from fontTools.ttLib import TTFont; f=TTFont('NotoSansDevanagari-Regular.ttf'); assert not any(t in f for t in ['fvar', 'gvar', 'HVAR', 'avar'])"
```
