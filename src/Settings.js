import { extension_settings } from '../../../../extensions.js';

export class Settings {
    /**@type {string} */ #converter = 'marked';
    get converter() { return this.#converter; }
    set converter(value) {
        if (this.#converter != value) {
            this.#converter = value;
            this.onStatusChange?.();
        }
    }
    /**@type {boolean} */ #onlyConverter = false;
    get onlyConverter() { return this.#onlyConverter; }
    set onlyConverter(value) {
        if (this.#onlyConverter != value) {
            this.#onlyConverter = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #blockquotes = true;
    get blockquotes() { return this.#blockquotes; }
    set blockquotes(value) {
        if (this.#blockquotes != value) {
            this.#blockquotes = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #customTags = true;
    get customTags() { return this.#customTags; }
    set customTags(value) {
        if (this.#customTags != value) {
            this.#customTags = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #closeTags = true;
    get closeTags() { return this.#closeTags; }
    set closeTags(value) {
        if (this.#closeTags != value) {
            this.#closeTags = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #fixLists = true;
    get fixLists() { return this.#fixLists; }
    set fixLists(value) {
        if (this.#fixLists != value) {
            this.#fixLists = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #fixHr = true;
    get fixHr() { return this.#fixHr; }
    set fixHr(value) {
        if (this.#fixHr != value) {
            this.#fixHr = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #fadeParagraphs = true;
    get fadeParagraphs() { return this.#fadeParagraphs; }
    set fadeParagraphs(value) {
        if (this.#fadeParagraphs != value) {
            this.#fadeParagraphs = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #fadeParagraphsPlaceholder = true;
    get fadeParagraphsPlaceholder() { return this.#fadeParagraphsPlaceholder; }
    set fadeParagraphsPlaceholder(value) {
        if (this.#fadeParagraphsPlaceholder != value) {
            this.#fadeParagraphsPlaceholder = value;
            this.onSettingsChange?.();
        }
    }
    /**@type {boolean} */ #morphdom = true;
    get morphdom() { return this.#morphdom; }
    set morphdom(value) {
        if (this.#morphdom != value) {
            this.#morphdom = value;
            this.onSettingsChange?.();
        }
    }
	
	/**@type {boolean} */ #disableDOMPurify = false;
    get disableDOMPurify() { return this.#disableDOMPurify; }
    set disableDOMPurify(value) {
        if (this.#disableDOMPurify != value) {
            this.#disableDOMPurify = value;
            this.onSettingsChange?.();
        }
    }

    /**@type {()=>void} */ onStatusChange;
    /**@type {()=>void} */ onSettingsChange;




    constructor() {
        const data = extension_settings.alternativeMarkdownConverter ?? {};
        Object.assign(this, data);
        extension_settings.alternativeMarkdownConverter = this;
        this.render();
    }

    toJSON() {
        return {
            converter: this.converter,
            onlyConverter: this.onlyConverter,
            blockquotes: this.blockquotes,
            customTags: this.customTags,
            closeTags: this.closeTags,
            fixLists: this.fixLists,
            fixHr: this.fixHr,
            fadeParagraphs: this.fadeParagraphs,
            morphdom: this.morphdom,
            disableDOMPurify: this.disableDOMPurify,
        };
    }


    async render() {
        if (document.querySelector('#stamc--settings')) return;
        const url = '/scripts/extensions/third-party/ST-disabl-dompurify/html/settings.html';
        const response = await fetch(url);
        if (!response.ok) {
            return console.warn('failed to fetch template:', url);
        }
        const settingsTpl = document.createRange().createContextualFragment(await response.text()).querySelector('#stamc--settings');
        /**@type {HTMLElement} */
        const dom = /**@type {HTMLElement}*/(settingsTpl.cloneNode(true));
        document.querySelector('#extensions_settings').append(dom);

        for (const key of ['converter']) {
            const cb = /**@type {HTMLInputElement}*/(dom.querySelector(`#stamc--${key}`));
            cb.value = this[key];
            cb.addEventListener('input', ()=>{
                this[key] = cb.value;
            });
            const lbl = cb.closest('label');
            lbl.append(document.createElement('br'));
            const hint = document.createElement('small'); {
                hint.textContent = lbl.title;
                lbl.append(hint);
            }
        }
        for (const key of ['onlyConverter', 'blockquotes', 'customTags', 'closeTags', 'fixLists', 'fixHr', 'fadeParagraphs', 'fadeParagraphsPlaceholder', 'morphdom', 'disableDOMPurify']) {
            const cb = /**@type {HTMLInputElement}*/(dom.querySelector(`#stamc--${key}`));
            cb.checked = this[key];
            cb.addEventListener('click', ()=>{
                this[key] = cb.checked;
            });
            const lbl = cb.closest('label');
            lbl.append(document.createElement('br'));
            const hint = document.createElement('small'); {
                hint.textContent = lbl.title;
                lbl.append(hint);
            }
        }
    }
}
