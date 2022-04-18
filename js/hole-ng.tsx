import { $, $$, comma } from './_util';
import { ASMStateField }                       from '@defasm/codemirror';
import LZString                                from 'lz-string';
import { EditorState, EditorView, extensions } from './_codemirror.js';
import                                              './_copy-as-json';
import diffTable                               from './_diff';
import pbm                                     from './_pbm.js';
import { byteLen, charLen, ord }               from './_util';

const all         = $<HTMLAnchorElement>('#all');
const hole        = decodeURI(location.pathname.slice(4));
const langs       = JSON.parse($('#langs').innerText);
const popups      = $('#popups');
const rankings    = $('#rankings');
const scoringTabs = $$<HTMLAnchorElement>('#scoringTabs a');
const select      = $<HTMLSelectElement>('select');
const solutions   = JSON.parse($('#solutions').innerText);
const status      = $('#status');
const statusH2    = $('#status h2');
const strokes     = $('#strokes');
const thirdParty  = $('#thirdParty');
const diffContent = $('#diff');

const darkMode =
    matchMedia(JSON.parse($('#darkModeMediaQuery').innerText)).matches;

const baseExtensions =
    darkMode ? [...extensions.dark, ...extensions.base] : extensions.base;

let lang: string = '';
let scoring = 'bytes';

const editor = new EditorView({
    dispatch: tr => {
        const result = editor.update([tr]) as unknown;
        const scorings: {byte?: number, char?: number} = {};
        const scoringKeys = ['byte', 'char'] as const;

        if (lang == 'assembly')
            scorings.byte = (editor.state.field(ASMStateField) as any).head.length();
        else {
            const code = [...tr.state.doc].join('');

            scorings.byte = byteLen(code);
            scorings.char = charLen(code);
        }

        strokes.innerText = scoringKeys
            .map(s => `${scorings[s]} ${s}${scorings[s] != 1 ? 's' : ''}`)
            .join(', ');

        return result;
    },
    parent: $('#editor'),
});

editor.contentDOM.setAttribute('data-gramm', 'false');  // Disable Grammarly.

// Update UI.
async function update() {
    // From left to right... update lang select.
    const svg = $('#' + lang);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const color = (darkMode ? '#1e2124' : '#fdfdfd').replaceAll('#', '%23');
    const data = svg.outerHTML.replaceAll('currentColor', color)
        .replaceAll('#', '%23').replaceAll('"', "'");

    select.style.background = `url("data:image/svg+xml,${data}") no-repeat left .5rem center/1rem auto, url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path d='M2 0L0 2h4zm0 5L0 3h4' fill='${color}'/></svg>") no-repeat right .5rem center/auto calc(100% - 1.25rem), var(--color)`;

    // Update scoring tabs.
    for (const tab of scoringTabs)
        if (tab.id == scoring)
            tab.removeAttribute('href');
        else
            tab.href = '';

    // Update "All" link.
    all.href = `/rankings/holes/${hole}/${lang}/${scoring}`;

    const res  = await fetch(`/api/mini-rankings/${hole}/${lang}/${scoring}/me?ng=1`);
    const rows: any[] = res.ok ? await res.json() : [];

    rankings.replaceChildren(<tbody>{
        // Rows.
        rows.map(r => <tr class={r.me ? 'me' : ''}>
            <td>{r.rank}<sup>{ord(r.rank)}</sup></td>
            <td>
                <a href={`/golfers/${r.golfer.name}`}>
                    <img src={`//avatars.githubusercontent.com/${r.golfer.name}?s=24`}/>
                    <span>{r.golfer.name}</span>
                </a>
            </td>
            <td class="right">{comma(r[scoring])}</td>
        </tr>)
    }{
        // Padding.
        [...Array(15 - rows.length).keys()].map(() =>
            <tr><td colspan="3">&nbsp;</td></tr>)
    }</tbody>);
}

// Switch scoring
for (const tab of scoringTabs)
    tab.onclick = (e: MouseEvent) => { e.preventDefault(); scoring = tab.id; update() };

// Switch lang
const switchLang = onhashchange = () => {
    const hashLang = location.hash.slice(1) || localStorage.getItem('lang');

    // Kick 'em to Python if we don't know the chosen language, or if there is no given language.
    lang = hashLang && langs[hashLang] ? hashLang : 'python';

    select.value = lang;
    localStorage.setItem('lang', lang);
    window.history.replaceState(null, '', '#' + lang);

    editor.setState(
        EditorState.create({
            doc:        solutions[lang]?.[scoring] ?? langs[lang].example,
            extensions: [
                ...baseExtensions,

                extensions[lang as keyof typeof extensions] || [],

                // These languages shouldn't match brackets.
                ['brainfuck', 'fish', 'j', 'hexagony'].includes(lang)
                    ? [] : extensions.bracketMatching,

                // These languages shouldn't wrap lines.
                ['assembly', 'fish', 'hexagony'].includes(lang)
                    ? [] : EditorView.lineWrapping,
            ],
        }),
    );

    if (lang == 'assembly') {
        scoring = 'bytes';
        scoringTabs[1].style.display = 'none';
    }
    else
        scoringTabs[1].style.display = '';

    for (const info of $$('main .info'))
        info.style.display = info.classList.contains(lang) ? 'block' : '';

    // Dispatch to update strokes.
    editor.dispatch();

    update();
};

select.onchange = () => {
    window.history.replaceState(null, '', '#' + select.value);
    switchLang();
};

switchLang();

// Run Code
const runCode = $('#run a').onclick = async () => {
    $$('canvas').forEach(e => e.remove());

    status.style.display = 'none';

    const code = [...editor.state.doc].join('');
    const res  = await fetch('/solution', {
        method: 'POST',
        body: JSON.stringify({
            Code: code,
            Hole: hole,
            Lang: lang,
        }),
    });

    if (res.status != 200) {
        alert('Error ' + res.status);
        return;
    }

    const data = await res.json() as {
        Pass: boolean,
        Out: string,
        Exp: string,
        Err: string,
        Argv: string[],
        Cheevos: {
            emoji: string,
            name: string
        }[]
    };

    status.style.background = data.Pass ? 'var(--green)' : 'var(--red)';
    statusH2.innerText      = data.Pass ? 'Pass 😀'      : 'Fail ☹️';

    $('#arguments').replaceChildren(
        ...data.Argv.map(arg => <span>{arg}</span>));

    diffContent.replaceChildren(
        diffTable(hole, data.Exp, data.Out, data.Argv) ?? '');

    $('#errors').innerHTML   = data.Err;
    $('#expected').innerText = data.Exp;
    $('#output').innerText   = data.Out;

    // 3rd party integrations.
    thirdParty.replaceChildren( lang == 'hexagony' ? <a href={
        '//hexagony.net#lz' + LZString.compressToBase64(JSON.stringify({
            code, input: data.Argv.join('\0') + '\0', inputMode: 'raw' }))
    }>Run on Hexagony.net</a> : '' );

    if (hole == 'julia-set')
        $('main').append(pbm(data.Exp) as Node, pbm(data.Out) ?? [] as any);

    status.style.display = 'grid';

    update();

    // Show cheevos.
    popups.replaceChildren(...data.Cheevos.map(c => <div>
        <h3>Achievement Earned!</h3>
        { c.emoji }<p>{ c.name }</p>
    </div>));
};

onkeydown = e => (e.ctrlKey || e.metaKey) && e.key == 'Enter' ? runCode() : undefined;