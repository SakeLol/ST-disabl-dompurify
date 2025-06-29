import { morphdom } from '../../../../lib.js';
import { chat, event_types, eventSource, messageFormatting, reloadMarkdownProcessor, saveSettingsDebounced, streamingProcessor } from '../../../../script.js';
import { debounce_timeout } from '../../../constants.js';
import { debounce, delay, escapeRegex, uuidv4 } from '../../../utils.js';
import { marked } from './lib/marked.esm.js';
import { gfm, gfmHtml } from './lib/micromark-extension-gfm.bundle.js';
import { micromark } from './lib/micromark.bundle.js';
import { stringSplice } from './lib/stringSplice.js';
import { Settings } from './src/Settings.js';


// eslint-disable-next-line no-undef
const ShowdownConverter = showdown.Converter;


const settings = new Settings();
settings.onStatusChange = ()=>{
    enable();
    handleSettingsChangeDebounced();
};
const handleSettingsChange = ()=>{
    saveSettingsDebounced();
	if (settings.disableDOMPurify) {
		DOMPurify.backup_sanitize = DOMPurify.sanitize;
		DOMPurify.sanitize = (x) => x;
	} else {
		DOMPurify.sanitize = DOMPurify.backup_sanitize;
	}
	
    for (const mesElement of /**@type {HTMLElement[]} */([...document.querySelectorAll('#chat .mes')])) {
        const mesId = parseInt(mesElement.getAttribute('mesid'));
        const mes = chat[mesId];
        mesElement.querySelector('.mes_text').innerHTML = messageFormatting(
            mes.mes,
            mes.name,
            mes.is_system,
            mes.is_user,
            mesId,
        );
    }
};
const handleSettingsChangeDebounced = debounce(handleSettingsChange, debounce_timeout.relaxed);
settings.onSettingsChange = ()=>handleSettingsChangeDebounced();


document.querySelector('#chat').addEventListener('click', async(evt)=>{
    const target = /**@type {HTMLElement}*/(evt.target);
    if (target.classList.contains('custom-stamc--copy') && target.closest('.custom-stamc--blockquote')) {
        const text = target.getAttribute('data-text');
        let ok = false;
        try {
            navigator.clipboard.writeText(text);
            ok = true;
        } catch {
            console.warn('/copy cannot use clipboard API, falling back to execCommand');
            const ta = document.createElement('textarea'); {
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.inset = '0';
                document.body.append(ta);
                ta.focus();
                ta.select();
                try {
                    document.execCommand('copy');
                    ok = true;
                } catch (err) {
                    console.error('Unable to copy to clipboard', err);
                }
                ta.remove();
            }
        }
        target.classList.add(`custom-stamc--${ok ? 'success' : 'failure'}`);
        await delay(1000);
        target.classList.remove(`custom-stamc--${ok ? 'success' : 'failure'}`);
    }
});

/**
 * keep track of custom tags and remember for all runs
 * @type {{[tag:string]:boolean}}
 */
const isCustomTag = {};
const enable = ()=>{
    // @ts-ignore
    // eslint-disable-next-line no-undef
    showdown.Converter = class Converter {
        options;
        /**@type {showdown.Converter} */
        showdownConverter;
        constructor(options) {
            this.options = options;
            this.showdownConverter = new ShowdownConverter(options);
            marked.use({
                breaks: true,
            });
        }
        addExtension(...args) {
            // @ts-ignore
            this.showdownConverter.addExtension(...args);
        }
        convert(md) {
            switch (settings.converter) {
                case 'marked': {
                    return marked.parse(md);
                }
                case 'micromark': {
                    return md;
                }
                case 'showdown': {
                    return this.showdownConverter.makeHtml(md);
                }
                default: {
                    toastr.error('No valid markdown converter selected!', 'Alternative Markdown Converter', {
                        preventDuplicates: true,
                    });
                    break;
                }
            }
        }
        /**
         *
         * @param {string} md
         * @returns
         */
        makeHtml(md) {
            if (settings.onlyConverter) {
                return this.convert(md);
            }
			
			
			
            let messageText = md;

            // due to "simple linebreaks" instead of proper markdown linebreaks, list items continue
            // even after a linebreak, this is usually *not* wanted, so let's fix it by adding another
            // linebreak after any list items not followed by another list item
            if (settings.fixLists) {
                const olRe = /(^|\n)(\d+\.[^\n]+\n)((?!\d+\.)[^\n])/gs;
                const ulRe = /(^|\n)(\s*[-*]\s+[^\n]+\n)((?!\s*[-*]\s+|\s\s+)[^\n])/gs;
                messageText = messageText
                    .replace(olRe, '$1$2\n$3')
                    .replace(ulRe, '$1$2\n$3')
                ;
            }

            if (settings.fixHr) {
                const hrRe = /^---+$/mg;
                messageText = messageText
                    .replace(hrRe, '\n$&')
                ;
            }

            // regex-step through the text to do multiple things:
            // 1) attempt to close unclosed tags
            // 2) collect custom tags (to hide them from showdown)
            const re = /(?<code>```)|(?<inlineCode>`)|(?<newline>\n)|<\/(?<closer>[^/>\s]+)>|<(?<tag>[a-z][^/>\s]*)(?<attributes>\s[^/>]+)?>/i;
            /**@type {RegExpExecArray} */
            let match;
            let remaining = messageText;
            let close = [];
            let inCode = false;
            let inInlineCode = false;
            const codeTagMap = {};
            const tagMap = {};
            const codeTags = [];
            const codeReplace = [];
            const tags = [];
            const replace = [];
            let offset = 0;
            while ((match = re.exec(remaining)) != null) {
                const groups = /**@type {{code:string, inlineCode:string, newline:string, closer:string, tag:string, attributes:string}} */(match.groups);
                remaining = remaining.slice(match.index + match[0].length);
                let newOffset = offset + match.index + match[0].length;
                // independent of the rest, if we encounter a tag we check if it is a custom tag
                if (settings.customTags && groups.tag) {
                    // don't do anything if we already know about this tag
                    if (isCustomTag[groups.tag] === undefined) {
                        if (groups.tag.includes('-')) {
                            // tags with a dash are always custom
                            isCustomTag[groups.tag] = true;
                        } else {
                            // without dash we need to check the resulting class
                            const el = document.createElement(groups.tag);
                            isCustomTag[groups.tag] = (el instanceof HTMLUnknownElement);
                        }
                    }
                }
                if (inCode) {
                    if (groups.code) {
                        inCode = false;
                    } else if (groups.tag) {
                        // record tag for replacement
                        const fullTag = match[0];
                        if (!codeTags.includes(fullTag)) codeTags.push(fullTag);
                        codeReplace.push({ tag: fullTag, index: offset + match.index, length: fullTag.length, tagMap: codeTagMap });
                    } else if (groups.closer) {
                        // record closing tag for replacement
                        const fullTag = match[0];
                        if (!codeTags.includes(fullTag)) codeTags.push(fullTag);
                        codeReplace.push({ tag: fullTag, index: offset + match.index, length: fullTag.length, tagMap: codeTagMap });
                    }
                } else if (inInlineCode) {
                    if (groups.inlineCode || groups.newline) inInlineCode = false;
                } else {
                    if (groups.code) {
                        inCode = true;
                    } else if (groups.inlineCode) {
                        inInlineCode = true;
                    } else if (groups.tag) {
                        // record tag for replacement
                        const fullTag = match[0];
                        if (!tags.includes(fullTag)) tags.push(fullTag);
                        replace.push({ tag: fullTag, index: offset + match.index, length: fullTag.length, tagMap: tagMap, isCustom: isCustomTag[groups.tag], isClosed:false });
                        // if opening tag is preceded by double newline, closing tag must be succeeded by double newline
                        const tagIsBlock = offset + match.index == 0 || messageText.slice(offset + match.index - 2, 2) == '\n\n';
                        // check for closing
                        const tag = groups.tag;
                        const closeRe = new RegExp(escapeRegex(`</${tag}>`));
                        const closeMatch = closeRe.exec(remaining);
                        if (closeMatch) {
                            // record closing tag for replacement
                            const fullTag = closeMatch[0];
                            if (!tags.includes(fullTag)) tags.push(fullTag);
                            replace.at(-1).isClosed = true;
                            replace.push({ tag: fullTag, index: newOffset + closeMatch.index, length: fullTag.length, tagMap: tagMap, isCustom: isCustomTag[groups.tag] });
                            if ((tagIsBlock || isCustomTag[groups.tag]) && remaining.slice(closeMatch.index + fullTag.length, 2) != '\n\n') {
                                messageText = stringSplice(messageText, newOffset + closeMatch.index + fullTag.length, 0, '\n\n');
                                newOffset += 2;
                            }
                            // remove closing tag from remaining text
                            remaining = `${remaining.slice(0, closeMatch.index)}${' '.repeat(closeMatch[0].length)}${remaining.slice(closeMatch.index + closeMatch[0].length)}`;
                        } else if (settings.closeTags) {
                            // record missing closing tag for closing at the end
                            close.push(tag);
                        }
                    }
                }
                offset = newOffset;
            }
            for (const tag of close.toReversed()) {
                // record closing tag for replacement
                const fullTag = `</${tag}>`;
                if (!tags.includes(fullTag)) tags.push(fullTag);
                replace.push({ tag: fullTag, index: messageText.length, length: fullTag.length, tagMap: tagMap, isCustom: isCustomTag[tag] });
                // add closing tag to text
                messageText += fullTag;
            }

            // need to start repacements at the back, because the text gets longer with each replacement
            if (settings.customTags) {
                const joinedReplace = [...codeReplace, ...replace].toSorted((a,b)=>a.index - b.index);
                for (const { index, length, tag, tagMap, isCustom } of joinedReplace.toReversed()) {
                    if (!isCustom) continue;
                    if (tagMap[tag] === undefined) {
                        tagMap[tag] = uuidv4();
                    }
                    const id = tagMap[tag];
                    messageText = stringSplice(messageText, index, length, `\n§§§${id}§§§`);
                }
            }

            if (settings.blockquotes) {
                // handle blockquotes ourselves, two reasons:
                // 1) showdown continues blockquote even when the next line does not start with '> '
                // 2) add copy button
                const lines = messageText.split('\n');
                /**@type {{type:string, lines:string[]}[]} */
                const parts = [];
                /**@type {{type:string, lines:string[]}} */
                let part;
                for (const line of lines) {
                    if (line[0] == '>') {
                        const trimmedLine = line.replace(/^>\s*/, '');
                        if (part?.type == 'blockquote') {
                            part.lines.push(trimmedLine);
                        } else {
                            part = { type:'blockquote', lines:[trimmedLine] };
                            parts.push(part);
                        }
                    } else {
                        if (part?.type == 'markdown') {
                            part.lines.push(line);
                        } else {
                            part = { type:'markdown', lines:[line] };
                            parts.push(part);
                        }
                    }
                }
                messageText = parts
                    .map(part=>{
                        switch (part.type) {
                            case 'blockquote': {
                                const text = part.lines.join('\n');
                                const el = document.createElement('blockquote'); {
                                    el.classList.add('stamc--blockquote');
                                    el.innerHTML = this.convert(text);
                                    const copy = document.createElement('div'); {
                                        copy.classList.add('stamc--copy');
                                        copy.classList.add('menu_button');
                                        copy.classList.add('fa-solid', 'fa-fw', 'fa-copy');
                                        copy.title = 'Copy quote to clipboard';
                                        copy.setAttribute('data-text', text);
                                        el.append(copy);
                                    }
                                }
                                return el.outerHTML;
                            }
                            default: {
                                return this.convert(part.lines.join('\n'));
                            }
                        }
                    })
                    .join('\n')
                ;
            } else {
                messageText = this.convert(messageText);
            }

            // restore custom tags in codeblocks and inline-code
            for (const [tag, id] of Object.entries(codeTagMap)) {
                messageText = messageText.replaceAll(`\n§§§${id}§§§`, tag.replace('<', '&lt;').replace('>', '&gt;'));
            }
            // restore custom tags and add annotations
            for (const [tag, id] of Object.entries(tagMap)) {
                const div = tag.replace(/^<(\/?)(\S+)(\s+[^>]+)?>$/, (_, close, tag, attributes)=>{
                    if (close) return `<div class="stamc--tag-close" data-tag="${tag}"></div></div>`;
                    return `<div class="stamc--custom" data-tag="${tag}" ${attributes ?? ''}><div class="stamc--tag" data-tag="${tag}"></div>`;
                });
                messageText = messageText.replaceAll(`§§§${id}§§§`, div);
            }
            if (settings.fadeParagraphs)
            {
                const html = document.createElement('div');
                html.innerHTML = messageText;
                const paras = [...html.querySelectorAll('p')];
                for (const p of paras) {
                    if (!p.querySelector('br')) continue;
                    p.outerHTML = p.outerHTML.replace(/<br\s*\/?>/g, '</p><p>');
                }
                [...html.querySelectorAll(':is(p, ul, ol, li, table, blockquote, pre, h1, h2, h3, h4, h5, h6, hr, div):not([class*="stamc--tag"], [class*="stamc--placeholder"], [class*="stamc--line"])')].pop()?.classList.add('stamc--lastBlock');
                messageText = html.innerHTML
                    .replace(/<p>\s*<\/p>/gs, '')
                ;
            }
            return messageText;
        }
    };
    reloadMarkdownProcessor();
};
enable();



const shuffle = (list)=>{
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
};
{ // Paragraph fade-in during streaming + morphdom
    let morphdomProxy;
    const hookMorphdomProxy = (streamingProcessor)=>{
        if (settings.morphdom && morphdomProxy != streamingProcessor.messageTextDom && streamingProcessor.messageTextDom instanceof HTMLElement) {
            morphdomProxy = new Proxy(streamingProcessor.messageTextDom, {
                set: (target, property, newValue, receiver)=>{
                    switch (property) {
                        case 'innerHTML': {
                            morphdom(
                                target,
                                `<div>${newValue}</div>`,
                                { childrenOnly:true },
                            );
                            break;
                        }
                        default: {
                            target[property] = newValue;
                            break;
                        }
                    }
                    return true;
                },
                get: (target, property, receiver)=>{
                    return target[property];
                },
            });
            streamingProcessor.messageTextDom = morphdomProxy;
        }
    };
    let waiting = false;
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async()=>{
        waiting = false;
        if (settings.onlyConverter || (!settings.fadeParagraphs && !settings.morphdom)) return;
        await delay(150);
        (async()=>{
            waiting = true;
            console.log('[PARAFADE]', 'waiting for streaming processor...');
            while (!streamingProcessor) {
                if (!waiting) return;
                await delay(100);
            }
            console.log('[PARAFADE]', 'found streaming processor', streamingProcessor);
            hookMorphdomProxy(streamingProcessor);
            let lastText = '';
            streamingProcessor.messageTextDom?.classList.add('stamc--isStreaming');
            const original_onStartStreaming = streamingProcessor.onStartStreaming.bind(streamingProcessor);
            streamingProcessor.onStartStreaming = async(text)=>{
                console.log('[PARAFADE]', 'onStartStreaming');
                const mesId = await original_onStartStreaming(text);
                await streamingProcessor.onProgressStreaming(mesId, text, false);
                return mesId;
            };
            const original_onProgressStreaming = streamingProcessor.onProgressStreaming.bind(streamingProcessor);
            streamingProcessor.onProgressStreaming = async(messageId, text, isFinal)=>{
                hookMorphdomProxy(streamingProcessor);
                if (settings.fadeParagraphs) {
                    console.log('[PARAFADE]', { messageId, isFinal, text });
                    streamingProcessor.messageTextDom?.classList.add('stamc--isStreaming');
                    if (!isFinal) {
                        if (text != '...') {
                            const lines = text.trim().split(/\n/);
                            text = lines.slice(0, -1).join('\n');
                        }
                        if (text == lastText || (lastText == '...' && text == '')) return;
                        lastText = text;
                        if (settings.fadeParagraphsPlaceholder) {
                            if (text == '...') {
                                text = '';
                            }
                            const widths = [
                                `firstline-${Math.floor(Math.random() * 3 + 1)}`,
                                ...shuffle(Array.from({ length:3 }, (_,i)=>i + 1)).slice(0, 2).map(i=>`line-${i}`),
                                `lastline-${Math.floor(Math.random() * 3 + 1)}`,
                            ];
                            text += `\n\n<div class="stamc--placeholder">${widths.map(i=>`<div class="stamc--line stamc--${i}"></div>`).join('')}</div>`;
                        }
                    } else {
                        console.log('[PARAFADE]', 'final');
                        streamingProcessor.messageTextDom?.classList.remove('stamc--isStreaming');
                    }
                    console.log('[PARAFADE]', 'new text:', text);
                }
                return original_onProgressStreaming(messageId, text, isFinal);
            };
            waiting = false;
        })();
    });
}
