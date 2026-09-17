const state = {
  books: [], achievements: [], stats: {}, folders: [],
  filter: 'all', search: '', sort: 'recent', folder: 'all', tag: 'all',
  language: localStorage.getItem('bookroom.language') || 'ru',
  theme: localStorage.getItem('bookroom.theme') || 'dark',
  config: {}, view: localStorage.getItem('bookroom.view') || 'library',
  activeFolderBook: null,
  readerKey: null,
  editingKey: null,
  folderDialogMode: null,
  eventSource: null, liveRefreshTimer: null,
  polling: null,
  loading: false,
  selectedKeys: new Set(),
  bulkBusy: false
};

const PRESET_TAG_GROUPS = [
  { label:'tagGroupCommon', tags:[['programming','Programming'],['tech','Tech'],['software','Software'],['coding','Coding'],['career','Career'],['productivity','Productivity'],['education','Education'],['communication','Communication'],['leadership','Leadership'],['management','Management'],['research','Research']] },
  { label:'tagGroupWeb', tags:[['frontend','Frontend'],['backend','Backend'],['web','Web'],['html','HTML'],['css','CSS'],['javascript','JavaScript'],['typescript','TypeScript'],['react','React'],['vue','Vue'],['nodejs','Node.js'],['api','API'],['databases','Databases'],['postgresql','PostgreSQL'],['mongodb','MongoDB'],['redis','Redis'],['architecture','Architecture'],['testing','Testing']] },
  { label:'tagGroupAi', tags:[['ai','AI'],['ml','ML'],['machine-learning','Machine Learning'],['deep-learning','Deep Learning'],['llm','LLM'],['nlp','NLP'],['computer-vision','Computer Vision'],['data-science','Data Science'],['data-analysis','Data Analysis'],['statistics','Statistics'],['robotics','Robotics']] },
  { label:'tagGroupSystems', tags:[['linux','Linux'],['devops','DevOps'],['docker','Docker'],['cloud','Cloud'],['networking','Networking'],['cybersecurity','Cybersecurity'],['security','Security'],['infosec','InfoSec'],['algorithms','Algorithms'],['operating-systems','Operating Systems']] },
  { label:'tagGroupScience', tags:[['physics','Physics'],['science','Science'],['math','Math'],['mathematics','Mathematics'],['chemistry','Chemistry'],['biology','Biology'],['astronomy','Astronomy'],['neuroscience','Neuroscience']] },
  { label:'tagGroupHumanities', tags:[['history','History'],['historical','Historical'],['archaeology','Archaeology'],['geography','Geography'],['philosophy','Philosophy'],['logic','Logic'],['ethics','Ethics'],['sociology','Sociology'],['anthropology','Anthropology'],['linguistics','Linguistics'],['language','Language'],['languages','Languages'],['translation','Translation'],['psychology','Psychology'],['self-development','Self Development']] },
  { label:'tagGroupBusiness', tags:[['business','Business'],['entrepreneurship','Entrepreneurship'],['startup','Startup'],['finance','Finance'],['economics','Economics'],['investing','Investing'],['marketing','Marketing'],['product','Product'],['sales','Sales']] },
  { label:'tagGroupCreative', tags:[['design','Design'],['ui','UI'],['ux','UX'],['art','Art'],['gamedev','GameDev'],['game-development','Game Development'],['fiction','Fiction'],['literature','Literature'],['novel','Novel'],['poetry','Poetry'],['biography','Biography'],['storytelling','Storytelling'],['media','Media']] }
];

const I18N = {
  ru: {
    eyebrow:'ЛИЧНАЯ БИБЛИОТЕКА', newBookEyebrow:'НОВАЯ КНИГА', collectionEyebrow:'КОЛЛЕКЦИЯ', moveBookEyebrow:'ДОБАВИТЬ В КОЛЛЕКЦИИ',
    refresh:'Обновить', libraryTab:'Библиотека', achievementsTab:'Достижения', heroKicker:'ЧИТАЙ. ОТСЛЕЖИВАЙ. РАЗВИВАЙСЯ.', heroText:'Каждая книга превращается в маленький квест: читаешь, двигаешь прогресс, открываешь достижения.',
    average:'средний прогресс', books:'Книги', reading:'Читаю', completed:'Прочитано', pagesRead:'Пройдено страниц', averageProgress:'Средний прогресс',
    searchPlaceholder:'Поиск по книгам, авторам и тегам…', tagGroupCommon:'Общие', tagGroupWeb:'Web и разработка', tagGroupAi:'AI и данные', tagGroupSystems:'Системы и безопасность', tagGroupScience:'Наука', tagGroupHumanities:'Гуманитарные', tagGroupBusiness:'Бизнес', tagGroupCreative:'Творчество',
    all:'Все', planned:'В планах', addBook:'Добавить книгу', achievements:'Достижения', achievementsHint:'автоматически записываются в Obsidian', myLibrary:'Моя библиотека',
    emptyTitle:'Библиотека пока пуста', emptyText:'Добавь первую книгу или сразу выбери PDF.', addBookTitle:'Добавить книгу', titleLabel:'Название', authorLabel:'Автор',
    titlePlaceholder:'Например, Sapiens', authorPlaceholder:'Автор книги', tagsLabel:'Теги', tagsHint:'выбери несколько', customTagPlaceholder:'свой тег: например, rust',
    attachPdf:'Прикрепить PDF', pdfHint:'Первая страница станет обложкой · до 150 МБ', cancel:'Отмена', save:'Сохранить', progress:'Прогресс', page:'Страница',
    openPdf:'Открыть PDF', attach:'Прикрепить PDF', detach:'Открепить PDF', plannedStatus:'В планах', readingStatus:'Читаю', completedStatus:'Готово', noPdf:'PDF нет', noFolder:'Без коллекции', noTags:'без тегов',
    detachConfirm:'Открепить PDF от книги? Сам файл останется в Obsidian Vault.', detachDone:'PDF откреплён. Сам файл сохранён в Vault.', pdfAttached:'PDF прикреплён', choosePdf:'Выберите PDF', invalidPdf:'Нужен PDF-файл.', uploadError:'Не удалось загрузить PDF.', generalError:'Что-то пошло не так.', pagesAuto:'стр.',
    sortRecent:'Сначала новые', sortOld:'Сначала старые', sortProgress:'По прогрессу', sortPages:'По странице', sortTitle:'По названию', sortAuthor:'По автору', sortFolder:'По коллекции', sortTag:'По тегу',
    foldersAll:'Все коллекции', tagsAll:'Все теги', booksCount:'книг', bookOne:'книга', bookFew:'книги', bookMany:'книг', achievementProgress:'прогресс', achievementDone:'получено', errorVault:'Не удалось прочитать библиотеку.', authorUnknown:'Автор не указан', live:'LIVE', saving:'Сохранение…', saved:'Сохранено',
    collections:'Коллекции', collectionsHint:'Отдельно от добавления книги · как плейлисты', newCollection:'Новая коллекция', newCollectionTitle:'Новая коллекция', collectionName:'Название коллекции', collectionPlaceholder:'Например, Что читаю сейчас', createCollection:'Создать',
    addToCollectionTitle:'Добавить в коллекции', addToCollection:'Сохранить', addToCollectionShort:'Коллекции', reader:'ЧИТАЛКА' , editBookEyebrow:'РЕДАКТИРОВАНИЕ', editBookTitle:'Изменить книгу', editSave:'Сохранить изменения', deleteBook:'Удалить книгу', deleteConfirm:'Удалить запись этой книги из библиотеки? PDF-файл останется в Vault.', pagesLabel:'Всего страниц', currentPageLabel:'Текущая страница', closeReader:'Закрыть', noCollections:'Коллекций пока нет', createFirstCollection:'Создай первую коллекцию', removeFromCollection:'Убрать из коллекции', collectionSelected:'Выбрано', addCollectionDone:'Книга добавлена в коллекцию.', selectBook:'Выбрать книгу', selectedCount:'Выбрано: {n}', selectAll:'Выбрать все', clearSelection:'Снять выбор', bulkCollections:'В коллекции', bulkDelete:'Удалить выбранные', multiImport:'Импортировать несколько PDF', multiImportHint:'Можно выбрать несколько PDF сразу — каждая станет отдельной книгой.', multiImportDone:'Импортировано книг: {n}', bulkCollectionTitle:'Добавить выбранные книги в коллекции', bulkCollectionHint:'Отметь коллекции, в которые нужно добавить все выбранные книги.', bulkCollectionDone:'Книг добавлено в коллекции: {n}', noSelection:'Сначала выбери хотя бы одну книгу.', bulkDeleteConfirm:'Удалить выбранные книги ({n}) из библиотеки? PDF-файлы останутся в Vault.', selectVisible:'Выбрать показанные'
  },
  en: {
    eyebrow:'PERSONAL LIBRARY', newBookEyebrow:'NEW BOOK', collectionEyebrow:'COLLECTION', moveBookEyebrow:'ADD TO COLLECTIONS',
    refresh:'Refresh', libraryTab:'Library', achievementsTab:'Achievements', heroKicker:'READ. TRACK. LEVEL UP.', heroText:'Every book becomes a tiny quest: read, move your progress, unlock achievements.',
    average:'average progress', books:'Books', reading:'Reading', completed:'Completed', pagesRead:'Pages read', averageProgress:'Average progress',
    searchPlaceholder:'Search books, authors and tags…', tagGroupCommon:'Common', tagGroupWeb:'Web & development', tagGroupAi:'AI & data', tagGroupSystems:'Systems & security', tagGroupScience:'Science', tagGroupHumanities:'Humanities', tagGroupBusiness:'Business', tagGroupCreative:'Creative',
    all:'All', planned:'Planned', addBook:'Add book', achievements:'Achievements', achievementsHint:'automatically written to Obsidian', myLibrary:'My library',
    emptyTitle:'Your library is empty', emptyText:'Add your first book or choose a PDF.', addBookTitle:'Add book', titleLabel:'Title', authorLabel:'Author',
    titlePlaceholder:'For example, Sapiens', authorPlaceholder:'Book author', tagsLabel:'Tags', tagsHint:'choose several', customTagPlaceholder:'custom tag: e.g. rust',
    attachPdf:'Attach PDF', pdfHint:'The first page becomes the cover · up to 150 MB', cancel:'Cancel', save:'Save', progress:'Progress', page:'Page',
    openPdf:'Open PDF', attach:'Attach PDF', detach:'Detach PDF', plannedStatus:'Planned', readingStatus:'Reading', completedStatus:'Completed', noPdf:'No PDF', noFolder:'No collection', noTags:'no tags',
    detachConfirm:'Detach this PDF from the book? The file will remain in your Obsidian Vault.', detachDone:'PDF detached. The file was kept in the Vault.', pdfAttached:'PDF attached', choosePdf:'Choose a PDF', invalidPdf:'A PDF file is required.', uploadError:'Could not upload the PDF.', generalError:'Something went wrong.', pagesAuto:'pages',
    sortRecent:'Newest', sortOld:'Oldest', sortProgress:'By progress', sortPages:'By page', sortTitle:'By title', sortAuthor:'By author', sortFolder:'By collection', sortTag:'By tag',
    foldersAll:'All collections', tagsAll:'All tags', booksCount:'books', bookOne:'book', bookFew:'books', bookMany:'books', achievementProgress:'progress', achievementDone:'unlocked', errorVault:'Could not load library.', authorUnknown:'Author not specified', live:'LIVE', saving:'Saving…', saved:'Saved',
    collections:'Collections', collectionsHint:'Separate from book creation · like playlists', newCollection:'New collection', newCollectionTitle:'New collection', collectionName:'Collection name', collectionPlaceholder:'For example, Reading now', createCollection:'Create',
    addToCollectionTitle:'Add to collections', addToCollection:'Save', addToCollectionShort:'Collections', reader:'READER' , editBookEyebrow:'EDIT BOOK', editBookTitle:'Edit book', editSave:'Save changes', deleteBook:'Delete book', deleteConfirm:'Delete this book from the library? The PDF file will remain in the Vault.', pagesLabel:'Total pages', currentPageLabel:'Current page', closeReader:'Close', noCollections:'No collections yet', createFirstCollection:'Create your first collection', removeFromCollection:'Remove from collection', collectionSelected:'Selected', addCollectionDone:'Book added to the collection.', selectBook:'Select book', selectedCount:'Selected: {n}', selectAll:'Select all', clearSelection:'Clear selection', bulkCollections:'Collections', bulkDelete:'Delete selected', multiImport:'Import multiple PDFs', multiImportHint:'Choose multiple PDFs at once — each becomes a separate book.', multiImportDone:'Books imported: {n}', bulkCollectionTitle:'Add selected books to collections', bulkCollectionHint:'Choose the collections where all selected books should be added.', bulkCollectionDone:'Books added to collections: {n}', noSelection:'Select at least one book first.', bulkDeleteConfirm:'Delete selected books ({n}) from the library? PDF files will remain in the Vault.', selectVisible:'Select visible'
  }
};

const $=(s,r=document)=>typeof r==='string'?document.querySelector(r)?.querySelector(s):r.querySelector(s), $$=(s,r=document)=>{const root=typeof r==='string'?document.querySelector(r):r;return root?[...root.querySelectorAll(s)]:[]}, t=k=>I18N[state.language][k]||k;
const icon=id=>`<svg class="icon"><use href="#i-${id}"></use></svg>`;
const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function pluralizeBook(n){ if(state.language==='en')return`${n} ${n===1?t('bookOne'):t('booksCount')}`; if(n%10===1&&n%100!==11)return`${n} ${t('bookOne')}`; if([2,3,4].includes(n%10)&&![12,13,14].includes(n%100))return`${n} ${t('bookFew')}`; return`${n} ${t('bookMany')}`; }
function statusLabel(s){return s==='completed'?t('completedStatus'):s==='reading'?t('readingStatus'):t('plannedStatus');}

function applyI18n(){
  document.documentElement.lang=state.language;
  $$('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  $$('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
  document.title=`${state.config.title||'Bookroom'} × Obsidian`;
  $('#brandTitle').innerHTML=`${escapeHtml(state.config.title||'Bookroom')} <span>× Obsidian</span>`;
  $('#greetingTitle').textContent=state.config.userName?`${state.config.userName} · ${state.language==='ru'?'библиотека':'library'}:`.replace(':',''):state.language==='ru'?'Моя библиотека':'My library';
  $('#themeBtn').innerHTML=icon(state.theme==='dark'?'sun':'moon');
  $('#themeBtn').title=state.theme==='dark'?(state.language==='ru'?'Светлая тема':'Light theme'):(state.language==='ru'?'Тёмная тема':'Dark theme');
  $('#languageBtn').textContent=state.language.toUpperCase();
  applyTheme(); buildTagPicker(); renderSelectOptions(); renderCollections(); renderStats(); renderAchievements(); updateAllCards({labelsOnly:true}); renderReaderTitle(); if(state.editingKey){const eb=state.books.find(x=>x.key===state.editingKey); if(eb){ $('#bookDialogEyebrow').textContent=t('editBookEyebrow'); $('#bookDialogTitle').textContent=t('editBookTitle'); $('#saveBtn span').textContent=t('editSave'); $('#dialogDeleteBtn').classList.remove('hidden'); }}
}
function applyTheme(){document.documentElement.dataset.theme=state.theme;}
function applyView(){
  const map={library:'#libraryView',achievements:'#achievementsView',reader:'#readerView'};
  Object.entries(map).forEach(([v,sel])=>$(sel)?.classList.toggle('hidden',state.view!==v));
  $('#libraryTab')?.classList.toggle('active',state.view==='library'); $('#achievementsTab')?.classList.toggle('active',state.view==='achievements');
}
function setView(v){state.view=v==='achievements'?'achievements':v==='reader'?'reader':'library'; localStorage.setItem('bookroom.view',state.view); applyView();}

function renderSelectOptions(){
  const sort=$('#sortSelect'); if(!sort)return;
  sort.innerHTML=[['recent',t('sortRecent')],['old',t('sortOld')],['progress',t('sortProgress')],['pages',t('sortPages')],['title',t('sortTitle')],['author',t('sortAuthor')],['folder',t('sortFolder')],['tag',t('sortTag')]].map(([v,l])=>`<option value="${v}">${escapeHtml(l)}</option>`).join(''); sort.value=state.sort;
  const folders=['all',...state.folders.map(f=>f.name)]; const fs=$('#folderSelect'); fs.innerHTML=folders.map(v=>`<option value="${escapeHtml(v)}">${v==='all'?t('foldersAll'):escapeHtml(v)}</option>`).join(''); fs.value=folders.includes(state.folder)?state.folder:'all'; if(!folders.includes(state.folder))state.folder='all';
  const tags=['all',...new Set(state.books.flatMap(b=>b.tags))]; const ts=$('#tagSelect'); ts.innerHTML=tags.map(v=>`<option value="${escapeHtml(v)}">${v==='all'?t('tagsAll'):'#'+escapeHtml(v)}</option>`).join(''); ts.value=tags.includes(state.tag)?state.tag:'all'; if(!tags.includes(state.tag))state.tag='all';
}
function filteredBooks(){
  const q=state.search.trim().toLowerCase(); const list=state.books.filter(b=>{
    const fm=state.filter==='all'||b.status===state.filter, fol=state.folder==='all'||(b.folders||((b.folder)?[b.folder]:[])).includes(state.folder), tag=state.tag==='all'||b.tags.includes(state.tag);
    const hay=[b.title,b.author,...(b.folders||[]),b.folder||'',...b.tags].join(' ').toLowerCase(); return fm&&fol&&tag&&(!q||hay.includes(q));
  });
  return list.sort((a,b)=>{if(state.sort==='progress')return b.progress-a.progress;if(state.sort==='pages')return Number(b.currentPage)-Number(a.currentPage);if(state.sort==='title')return a.title.localeCompare(b.title);if(state.sort==='author')return a.author.localeCompare(b.author);if(state.sort==='folder')return((a.folders||[]).join(' · ')).localeCompare((b.folders||[]).join(' · '))||a.title.localeCompare(b.title);if(state.sort==='tag')return(a.tags[0]||'').localeCompare(b.tags[0]||'')||a.title.localeCompare(b.title);if(state.sort==='old')return(a.added||'').localeCompare(b.added||'');return(b.lastRead||b.added||'').localeCompare(a.lastRead||a.added||'');});
}
function renderStats(){
  $('#statBooks').textContent=state.stats.books||0; $('#statReading').textContent=state.stats.reading||0; $('#statCompleted').textContent=state.stats.completed||0; $('#statPages').textContent=state.stats.pages||0; $('#statAvg').textContent=state.stats.avgProgress||0; $('#heroAvg').textContent=`${state.stats.avgProgress||0}%`; $('#avgBar').style.width=`${state.stats.avgProgress||0}%`; $('#bookCountLabel').textContent=pluralizeBook(filteredBooks().length);
}
function achievementLocalized(a){return {title:a[`title_${state.language}`]||a.title||a.title_ru,text:a[`text_${state.language}`]||a.text||a.text_ru};}
function localizedError(message){const map={'Введите название коллекции.':state.language==='ru'?'Введите название коллекции.':'Enter a collection name.','Такая коллекция уже существует.':state.language==='ru'?'Такая коллекция уже существует.':'This collection already exists.','Введите название книги.':state.language==='ru'?'Введите название книги.':'Enter a book title.','Выберите PDF.':state.language==='ru'?'Выберите PDF.':'Choose a PDF.','PDF-файл не получен.':state.language==='ru'?'PDF-файл не получен.':'PDF file was not received.','Введите название коллекции.':state.language==='ru'?'Введите название коллекции.':'Enter a collection name.'};return map[message]||message;}
function renderAchievements(){
  $('#achievements').innerHTML=state.achievements.map(a=>{const value=Math.min(a.value,a.target), pct=a.target?Math.min(100,Math.round(value/a.target*100)):0,loc=achievementLocalized(a);return `<article class="achievement ${a.unlocked?'':'locked'}"><div class="achievement-icon">${a.icon}</div><div class="achievement-meta"><strong>${escapeHtml(loc.title)}</strong><span>${a.unlocked?t('achievementDone'):`${value}/${a.target}`}</span></div><div class="achievement-text">${escapeHtml(loc.text)}</div><div class="achievement-progress"><span style="width:${pct}%"></span></div></article>`;}).join('');
}
function buildTagPicker(){const wrap=$('#tagPicker'); if(!wrap)return; wrap.innerHTML=PRESET_TAG_GROUPS.map(g=>`<section class="tag-group"><div class="tag-group-title">${escapeHtml(t(g.label))}</div><div class="tag-group-tags">${g.tags.map(([id,label])=>`<button type="button" class="preset-tag" data-tag="${escapeHtml(id)}">#${escapeHtml(label)}</button>`).join('')}</div></section>`).join(''); $$('.preset-tag',wrap).forEach(b=>b.addEventListener('click',()=>b.classList.toggle('selected')));}
function getModalTags(){return[...new Set([...$$('.preset-tag.selected','#tagPicker').map(x=>x.dataset.tag),...$('#customTagInput').value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)])];}
function setModalTags(tags=[]){const selected=new Set(tags||[]);$$('.preset-tag','#tagPicker').forEach(x=>x.classList.toggle('selected',selected.has(x.dataset.tag)));const preset=new Set(PRESET_TAG_GROUPS.flatMap(g=>g.tags.map(([id])=>id)));$('#customTagInput').value=[...selected].filter(x=>!preset.has(x)).join(', ');}
function resetModal(){state.editingKey=null;$('#bookForm').reset();setModalTags([]);$('#fileLabel').textContent=t('attachPdf');$('#formError').classList.add('hidden');$('#pagesInput').value='';$('#currentPageInput').value='';$('#dialogDeleteBtn').classList.add('hidden');$('#bookDialogEyebrow').textContent=t('newBookEyebrow');$('#bookDialogTitle').textContent=t('addBookTitle');$('#saveBtn span').textContent=t('save');}
function openAddBook(){resetModal();$('#addDialog').showModal();setTimeout(()=>$('#titleInput').focus(),30);}
function openEditBook(book){const current=state.books.find(x=>x.key===book.key)||book;state.editingKey=current.key;$('#bookForm').reset();$('#titleInput').value=current.title||'';$('#authorInput').value=current.author||'';$('#pagesInput').value=Number(current.pages||0)||'';$('#currentPageInput').value=Number(current.currentPage||0)||'';setModalTags(current.tags||[]);$('#fileLabel').textContent=current.pdf?(current.pdf.split('/').pop()||t('pdfAttached')):t('attachPdf');$('#formError').classList.add('hidden');$('#dialogDeleteBtn').classList.remove('hidden');$('#bookDialogEyebrow').textContent=t('editBookEyebrow');$('#bookDialogTitle').textContent=t('editBookTitle');$('#saveBtn span').textContent=t('editSave');$('#addDialog').showModal();setTimeout(()=>$('#titleInput').focus(),30);}

function selectedBooks(){
  return state.books.filter(b=>state.selectedKeys.has(b.key));
}
function updateSelectionUI(){
  const count=state.selectedKeys.size;
  const bar=$('#bulkToolbar');
  if(!bar)return;
  bar.classList.toggle('hidden',count===0);
  $('#selectedCount').textContent=t('selectedCount').replace('{n}',String(count));
  $('#selectAllVisible').textContent=t('selectVisible');
  $('#clearSelection').textContent=t('clearSelection');
  $('#bulkCollectionsBtn span').textContent=t('bulkCollections');
  $('#bulkDeleteBtn span').textContent=t('bulkDelete');
  const visible=filteredBooks();
  const selectedVisible=visible.filter(b=>state.selectedKeys.has(b.key)).length;
  $('#selectAllVisible').disabled=!visible.length||selectedVisible===visible.length;
  $$('.book-card').forEach(card=>{
    const on=state.selectedKeys.has(card.dataset.key);
    card.classList.toggle('selected',on);
    const input=$('.book-select',card);
    if(input)input.checked=on;
  });
}
function toggleSelected(key,on){
  if(on)state.selectedKeys.add(key);else state.selectedKeys.delete(key);
  updateSelectionUI();
}
function selectVisibleBooks(){
  filteredBooks().forEach(b=>state.selectedKeys.add(b.key));
  updateSelectionUI();
}
function clearSelection(){state.selectedKeys.clear();updateSelectionUI();}

function renderCollections(){
  const wrap=$('#folderBar'); if(!wrap)return;
  const counts=new Map(state.folders.map(f=>[f.name,state.books.filter(b=>(b.folders||((b.folder)?[b.folder]:[])).includes(f.name)).length]));
  wrap.innerHTML=state.folders.length?`<button class="folder-chip ${state.folder==='all'?'active':''}" data-folder="all" type="button">${icon('book')}<span>${escapeHtml(t('foldersAll'))}</span><b>${state.books.length}</b></button>`+state.folders.map(f=>`<button class="folder-chip ${state.folder===f.name?'active':''}" data-folder="${escapeHtml(f.name)}" type="button">${icon('folder')}<span>${escapeHtml(f.name)}</span><b>${counts.get(f.name)||0}</b></button>`).join(''):`<div class="collection-empty">${icon('folder')}<span>${escapeHtml(t('noCollections'))}</span><button class="ghost-button" id="inlineNewFolder" type="button">${escapeHtml(t('createFirstCollection'))}</button></div>`;
  $$('.folder-chip',wrap).forEach(b=>b.addEventListener('click',()=>{state.folder=b.dataset.folder;renderCollections();renderSelectOptions();updateLibraryList();})); $('#inlineNewFolder')?.addEventListener('click',openNewFolder);
}
function renderFolderChoices(book){
  const wrap=$('#folderChoices'); const current=new Set(book.folders||((book.folder)?[book.folder]:[]));
  if(!state.folders.length){wrap.innerHTML=`<div class="collection-empty">${icon('folder')}<span>${escapeHtml(t('noCollections'))}</span></div>`;wrap.dataset.selected='[]';return;}
  wrap.innerHTML=state.folders.map(f=>`<button type="button" class="folder-choice ${current.has(f.name)?'selected':''}" data-folder="${escapeHtml(f.name)}">${icon('folder')}<span>${escapeHtml(f.name)}</span>${current.has(f.name)?'<b>✓</b>':''}</button>`).join('');
  wrap.dataset.selected=JSON.stringify([...current]);
  $$('.folder-choice',wrap).forEach(b=>b.addEventListener('click',()=>{const selected=new Set(JSON.parse(wrap.dataset.selected||'[]'));if(selected.has(b.dataset.folder))selected.delete(b.dataset.folder);else selected.add(b.dataset.folder);wrap.dataset.selected=JSON.stringify([...selected]);const on=selected.has(b.dataset.folder);b.classList.toggle('selected',on);b.querySelector('b')?.remove();if(on)b.insertAdjacentHTML('beforeend','<b>✓</b>');}));
}
function openAddToFolder(book){state.activeFolderBook=book;$('#addToFolderBookName').textContent=book.title;$('#addToFolderDialog .eyebrow').textContent=t('moveBookEyebrow');$('#addToFolderDialog h2').textContent=t('addToCollectionTitle');$('#addToFolderDialog .dialog-hint')?.remove();const wrap=$('#folderChoices');renderFolderChoices(book);wrap.dataset.folder=book.folder||'';$('#addToFolderError').classList.add('hidden');$('#addToFolderDialog').showModal();}
function openNewFolder(){ $('#folderForm').reset(); $('#folderError').classList.add('hidden'); $('#folderDialog').showModal(); setTimeout(()=>$('#newFolderInput').focus(),30); }
async function createFolder(){const name=$('#newFolderInput').value.trim(); if(!name)return; try{const r=await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}),d=await r.json();if(!r.ok)throw Error(d.error||t('generalError'));$('#folderDialog').close(); state.folders=d.folders||state.folders; renderCollections();renderSelectOptions();}catch(e){$('#folderError').textContent=localizedError(e.message);$('#folderError').classList.remove('hidden');}}
async function addBookToFolder(){const book=state.activeFolderBook;if(!book)return;const selected=JSON.parse($('#folderChoices').dataset.selected||'[]');try{const d=await apiPatch(book.key,{folders:selected});$('#addToFolderDialog').close();if(d?.book)replaceBook(d.book);updateLibraryList();renderCollections();renderSelectOptions();}catch(e){$('#addToFolderError').textContent=localizedError(e.message);$('#addToFolderError').classList.remove('hidden');}}

function createCard(book){
  const card=document.importNode($('#bookTemplate').content,true).firstElementChild; card.dataset.key=book.key; card.dataset.coverUrl='';
  $('#books').appendChild(card); bindCard(card,book); return card;
}
function getCard(book){return $(`.book-card[data-key="${CSS.escape(book.key)}"]`);}
function updateCard(card,book){
  $('.status-pill',card).textContent=statusLabel(book.status);$('.status-pill',card).className=`status-pill ${book.status}`;$('.book-title',card).textContent=book.title;$('.book-author',card).textContent=book.author||t('authorUnknown');
  const folderCount=(book.folders||((book.folder)?[book.folder]:[])).length;
  $('.progress-row span',card).textContent=t('progress');$('.page-row label span',card).textContent=t('page');$('.progress-number',card).textContent=`${book.progress}%`;$('.progress-fill',card).style.width=`${book.progress}%`;$('.page-input',card).value=Number(book.currentPage||0);$('.page-total',card).textContent=book.pages?`/ ${book.pages}`:'';
  $('.tag-list',card).innerHTML=book.tags.length?book.tags.slice(0,5).map(tag=>`<button class="tag-chip" type="button" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join(''):`<span class="tag-muted">${t('noTags')}</span>`;
  const open=$('.open-pdf',card);open.disabled=!book.pdf;$('.open-pdf span',card).textContent=book.pdf?t('openPdf'):t('noPdf');open.title=book.pdf?t('openPdf'):t('noPdf');const action=$('.pdf-action',card);action.innerHTML=`${icon(book.pdf?'link':'upload')}<span>${book.pdf?t('detach'):t('attach')}</span>`;action.title=book.pdf?t('detach'):t('attach');action.setAttribute('aria-label',action.title);
  const folders=$('.folder-button',card);folders.innerHTML=`${icon('folder')}<span>${escapeHtml(t('addToCollectionShort'))}</span>${folderCount?`<b>${folderCount}</b>`:''}`;folders.title=folderCount?`${t('addToCollectionShort')}: ${folderCount}`:t('addToCollectionShort');$('.delete-button',card).innerHTML=`${icon('trash')}<span>${escapeHtml(t('deleteBook'))}</span>`;$('.delete-button',card).title=t('deleteBook');
  card.classList.toggle('selected',state.selectedKeys.has(book.key));const select=$('.book-select',card);if(select){select.checked=state.selectedKeys.has(book.key);select.title=t('selectBook');select.setAttribute('aria-label',t('selectBook'));}
  $$('.tag-chip',card).forEach(tag=>{tag.onclick=e=>{e.stopPropagation();state.tag=tag.dataset.tag;renderSelectOptions();updateLibraryList();};});
}
async function renderPdfCover(canvas,url,book,card,force=false){
  if(!url){
    if(card.dataset.coverUrl!=='') defaultCover(canvas,book.title);
    $('.cover-empty',card).classList.remove('hidden');
    canvas.classList.add('hidden');
    card.dataset.coverUrl='';
    return;
  }
  if(!force&&card.dataset.coverUrl===url&&canvas.dataset.rendered==='1') return;
  if(canvas._coverPromise&&canvas._coverUrl===url) return canvas._coverPromise;
  card.dataset.coverUrl=url;
  canvas._coverUrl=url;
  canvas.dataset.rendered='0';
  $('.cover-empty',card).classList.add('hidden');
  canvas.classList.remove('hidden');
  canvas._coverPromise=(async()=>{
    try{
      const pdfjs=await import('/vendor/pdfjs/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
      const pdf=await pdfjs.getDocument({url,disableAutoFetch:false,disableStream:false}).promise;
      const page=await pdf.getPage(1);
      if(!book.pages||book.pages!==pdf.numPages) await patchBook(book.key,{pages:pdf.numPages},true);
      if(card.dataset.coverUrl!==url) return;
      const wrap=canvas.parentElement;
      const cssWidth=Math.max(180,wrap?.clientWidth||280);
      const baseViewport=page.getViewport({scale:1});
      const scale=Math.max(1,Math.min(2.2,cssWidth/baseViewport.width));
      const viewport=page.getViewport({scale});
      const dpr=window.devicePixelRatio||1;
      canvas.width=Math.ceil(viewport.width*dpr);
      canvas.height=Math.ceil(viewport.height*dpr);
      canvas.style.aspectRatio=`${canvas.width}/${canvas.height}`;
      await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[dpr,0,0,dpr,0,0]}).promise;
      canvas.dataset.rendered='1';
    }catch(error){
      console.warn('PDF preview failed:',error);
      if(card.dataset.coverUrl===url){
        canvas.dataset.rendered='0';
        defaultCover(canvas,book.title);
      }
    }finally{ canvas._coverPromise=null; }
  })();
  return canvas._coverPromise;
}
function defaultCover(canvas,title){const ctx=canvas.getContext('2d'),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||220,h=canvas.clientHeight||320;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#332a45');g.addColorStop(1,'#17131e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,255,255,.13)';ctx.strokeRect(13,13,w-26,h-26);ctx.fillStyle='rgba(255,255,255,.9)';ctx.font=`700 ${Math.max(24,w*.14)}px system-ui`;ctx.textAlign='center';ctx.fillText('BOOK',w/2,h*.48);ctx.fillStyle='rgba(255,255,255,.48)';ctx.font=`500 ${Math.max(10,w*.05)}px system-ui`;ctx.fillText(String(title||'BOOK').slice(0,24),w/2,h*.57);}
function bindCard(card,book){
  $('.book-select',card)?.addEventListener('click',e=>e.stopPropagation());
  $('.book-select',card)?.addEventListener('change',e=>toggleSelected(book.key,e.target.checked));
  $('.page-input',card).addEventListener('input',e=>{e.stopPropagation();const page=Math.max(0,Number(e.target.value||0));const local=state.books.find(x=>x.key===book.key);if(!local)return;if(local.pages>0){local.progress=Math.min(100,Math.round(page/local.pages*100));local.status=local.progress>=100?'completed':local.progress>0?'reading':'planned';}local.currentPage=local.pages?Math.min(page,local.pages):page;recalcLocalStats();updateCard(card,local);renderStats();clearTimeout(card._progressTimer);card._progressTimer=setTimeout(()=>patchBook(local.key,{currentPage:local.currentPage},true),220);});
  $('.open-pdf',card).addEventListener('click',e=>{e.stopPropagation();openPdf(state.books.find(x=>x.key===book.key)||book);});
  $('.pdf-action',card).addEventListener('click',e=>{e.stopPropagation();const current=state.books.find(x=>x.key===book.key)||book;current.pdf?detachPdf(current):choosePdfForBook(current);});
  $('.folder-button',card).addEventListener('click',e=>{e.stopPropagation();openAddToFolder(state.books.find(x=>x.key===book.key)||book);});
  $('.delete-button',card).addEventListener('click',e=>{e.stopPropagation();deleteBook(state.books.find(x=>x.key===book.key)||book);});
  card.addEventListener('click',e=>{if(e.target.closest('button,input,select,a,label'))return;openEditBook(state.books.find(x=>x.key===book.key)||book);});
}
function updateLibraryList(){
  const desired=filteredBooks(), wrap=$('#books'), keys=new Set(desired.map(b=>b.key));
  [...wrap.querySelectorAll('.book-card')].forEach(card=>{if(!keys.has(card.dataset.key)){state.selectedKeys.delete(card.dataset.key);card.remove();}});
  desired.forEach(book=>{
    let card=getCard(book);
    if(!card) card=createCard(book);
    updateCard(card,book);
    const canvas=$('.cover',card);
    renderPdfCover(canvas,book.pdfUrl||'',book,card,false);
  });
  $('#empty').classList.toggle('hidden',desired.length!==0||state.books.length!==0);
  renderStats();
  updateSelectionUI();
}
function updateAllCards(opts={}){state.books.forEach(book=>{const card=getCard(book);if(card)updateCard(card,book);}); if(!opts.labelsOnly)updateLibraryList();}
function recalcLocalStats(){const b=state.books;state.stats={books:b.length,reading:b.filter(x=>x.status==='reading').length,completed:b.filter(x=>x.progress>=100).length,pages:b.reduce((s,x)=>s+Number(x.currentPage||0),0),avgProgress:b.length?Math.round(b.reduce((s,x)=>s+x.progress,0)/b.length):0,folders:state.folders.map(x=>x.name),tags:[...new Set(b.flatMap(x=>x.tags))]};}

function openPdf(book){if(!book.pdf)return;state.readerKey=book.key;$('#readerTitle').textContent=book.title;const frame=$('#pdfFrame');const next=book.pdfUrl||'about:blank';if(frame.dataset.src!==next){frame.src=next;frame.dataset.src=next;}setView('reader');}
function renderReaderTitle(){if(state.readerKey){const b=state.books.find(x=>x.key===state.readerKey);if(b)$('#readerTitle').textContent=b.title;}}
function closeReader(){setView('library');}
function choosePdfForBook(book){const input=document.createElement('input');input.type='file';input.accept='application/pdf,.pdf';input.onchange=()=>input.files[0]&&attachPdf(book,input.files[0]);input.click();}
async function attachPdf(book,file,keepOpen=false){if(!file.name.toLowerCase().endsWith('.pdf')){alert(t('invalidPdf'));return null;}const form=new FormData();form.append('pdf',file);const r=await fetch(`/api/books/${encodeURIComponent(book.key)}/pdf`,{method:'POST',body:form}),d=await r.json();if(!r.ok){alert(d.error||t('uploadError'));return null;}if(!keepOpen)await loadBooks({preserveReader:true});return d;}
async function detachPdf(book){if(!confirm(t('detachConfirm')))return;const r=await fetch(`/api/books/${encodeURIComponent(book.key)}/pdf`,{method:'DELETE'}),d=await r.json();if(!r.ok)return alert(d.error||t('generalError'));await loadBooks({preserveReader:true});}
async function apiPatch(key,patch,silent=false){const r=await fetch(`/api/books/${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}),d=await r.json();if(!r.ok)throw Error(d.error||t('generalError'));if(d.book)replaceBook(d.book,d.moved?key:null);if(d.achievements)state.achievements=d.achievements;if(d.moved){renderCollections();renderSelectOptions();}renderStats();renderAchievements();updateLibraryList();return d;}
async function patchBook(key,patch,silent=false){try{return await apiPatch(key,patch,silent);}catch(e){if(!silent)alert(e.message);throw e;}}
function replaceBook(book,oldKey){if(oldKey){state.books=state.books.filter(x=>x.key!==oldKey);}const i=state.books.findIndex(x=>x.key===book.key);if(i>=0)state.books[i]=book;else state.books.push(book);}

async function submitBook(form){
  const file=$('#pdfInput').files[0],error=$('#formError');
  error.classList.add('hidden');
  const title=$('#titleInput').value.trim();
  if(!title)return;
  try{
    if(state.editingKey){
      const current=state.books.find(x=>x.key===state.editingKey);
      const d=await apiPatch(state.editingKey,{title,author:form.author.value.trim(),tags:getModalTags(),pages:Math.max(0,Number($('#pagesInput').value||0)),currentPage:Math.max(0,Number($('#currentPageInput').value||0))},false);
      if(file) await attachPdf(d.book||current,file,true);
      $('#addDialog').close();
      state.editingKey=null;
      await loadBooks({preserveReader:true});
      return;
    }
    const body=new FormData();
    body.append('title',title);body.append('author',form.author.value.trim());body.append('tags',JSON.stringify(getModalTags()));
    if(file)body.append('pdf',file);
    const r=await fetch(file?'/api/import':'/api/books',{method:'POST',body}),d=await r.json();
    if(!r.ok)throw Error(d.error||t('generalError'));
    $('#addDialog').close();await loadBooks();
  }catch(e){error.textContent=localizedError(e.message);error.classList.remove('hidden');}
}
async function deleteBook(book){
  if(!confirm(t('deleteConfirm')))return;
  try{
    const r=await fetch(`/api/books/${encodeURIComponent(book.key)}`,{method:'DELETE'}),d=await r.json();
    if(!r.ok)throw Error(d.error||t('generalError'));
    state.books=state.books.filter(x=>x.key!==book.key);state.achievements=d.achievements||state.achievements;
    recalcLocalStats();renderCollections();renderSelectOptions();renderAchievements();updateLibraryList();
    if(state.readerKey===book.key)closeReader();
  }catch(e){alert(e.message||t('generalError'));}
}
async function fetchState({quiet=false}={}){const r=await fetch('/api/books',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||t('errorVault'));const previous=state.books;const changed=new Set();const incoming=d.books||[];for(const b of incoming){const old=previous.find(x=>x.key===b.key);if(!old||old.progress!==b.progress||old.currentPage!==b.currentPage||old.pdfUrl!==b.pdfUrl||old.folder!==b.folder||old.title!==b.title)changed.add(b.key);}state.books=incoming;state.achievements=d.achievements||[];state.stats=d.stats||{};state.folders=d.folders||state.folders;renderCollections();renderSelectOptions();renderStats();renderAchievements();updateLibraryList();renderReaderTitle();if(state.view==='reader'&&state.readerKey){const rb=state.books.find(x=>x.key===state.readerKey);if(!rb?.pdf){closeReader();}}return changed.size||incoming.length!==previous.length;}
async function loadBooks(opts={}){if(state.loading)return;state.loading=true;try{await fetchState(opts);}catch(e){if(!opts.quiet)$('#books').innerHTML=`<div class="error-panel">${escapeHtml(e.message)}</div>`;}finally{state.loading=false;}}
function queueLiveRefresh(){clearTimeout(state.liveRefreshTimer);state.liveRefreshTimer=setTimeout(()=>loadBooks({quiet:true,preserveReader:true}),180);}
function startLiveUpdates(){if(window.EventSource){state.eventSource=new EventSource('/api/events');state.eventSource.onmessage=queueLiveRefresh;state.eventSource.onerror=()=>{};}state.polling=setInterval(()=>{if(document.visibilityState==='visible' && !state.eventSource?.readyState) loadBooks({quiet:true,preserveReader:true});},5000);}

function openMultiImport(){
  const input=document.createElement('input');
  input.type='file';
  input.multiple=true;
  input.accept='application/pdf,.pdf';
  input.addEventListener('change',async()=>{
    if(!input.files?.length)return;
    const form=new FormData();
    [...input.files].forEach(file=>form.append('pdfs',file));
    try{
      const r=await fetch('/api/import-multiple',{method:'POST',body:form});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||t('generalError'));
      state.selectedKeys.clear();
      await loadBooks();
      alert(t('multiImportDone').replace('{n}',String(d.imported||0)));
    }catch(e){alert(localizedError(e.message));}
  });
  input.click();
}

function renderBulkFolderChoices(){
  const wrap=$('#folderChoices');
  if(!state.folders.length){wrap.innerHTML=`<div class="collection-empty">${icon('folder')}<span>${escapeHtml(t('noCollections'))}</span><button class="ghost-button" id="bulkCreateCollection" type="button">${escapeHtml(t('createFirstCollection'))}</button></div>`;wrap.dataset.selected='[]';$('#bulkCreateCollection')?.addEventListener('click',()=>{closeAddToFolderDialog();openNewFolder();});return;}
  wrap.innerHTML=state.folders.map(f=>`<button type="button" class="folder-choice" data-folder="${escapeHtml(f.name)}">${icon('folder')}<span>${escapeHtml(f.name)}</span></button>`).join('');
  wrap.dataset.selected='[]';
  $$('.folder-choice',wrap).forEach(b=>b.addEventListener('click',()=>{
    const selected=new Set(JSON.parse(wrap.dataset.selected||'[]'));
    if(selected.has(b.dataset.folder)){selected.delete(b.dataset.folder);b.classList.remove('selected');b.querySelector('b')?.remove();}
    else{selected.add(b.dataset.folder);b.classList.add('selected');b.insertAdjacentHTML('beforeend','<b>✓</b>');}
    wrap.dataset.selected=JSON.stringify([...selected]);
  }));
}
function closeAddToFolderDialog(){if($('#addToFolderDialog')?.open)$('#addToFolderDialog').close();state.activeFolderBook=null;state.bulkBusy=false;}
function openBulkCollections(){
  const books=selectedBooks();
  if(!books.length){alert(t('noSelection'));return;}
  state.activeFolderBook=null;
  $('#addToFolderBookName').textContent=t('selectedCount').replace('{n}',String(books.length));
  $('#addToFolderDialog .eyebrow').textContent=state.language==='ru'?'ВЫБРАННЫЕ КНИГИ':'SELECTED BOOKS';
  $('#addToFolderDialog h2').textContent=t('bulkCollectionTitle');
  $('#addToFolderDialog .dialog-hint')?.remove();
  const hint=document.createElement('p');hint.className='dialog-hint';hint.textContent=t('bulkCollectionHint');$('#folderChoices').before(hint);
  renderBulkFolderChoices();$('#addToFolderError').classList.add('hidden');$('#addToFolderDialog').showModal();
}
async function bulkAddToCollections(){
  const books=selectedBooks();
  const folders=JSON.parse($('#folderChoices').dataset.selected||'[]');
  if(!books.length||!folders.length)return;
  state.bulkBusy=true;
  try{
    const r=await fetch('/api/books/bulk-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:books.map(b=>b.key),folders})});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||t('generalError'));
    closeAddToFolderDialog();state.selectedKeys.clear();await loadBooks();alert(t('bulkCollectionDone').replace('{n}',String(d.updated||0)));
  }catch(e){$('#addToFolderError').textContent=localizedError(e.message);$('#addToFolderError').classList.remove('hidden');}
  finally{state.bulkBusy=false;}
}
async function bulkDelete(){
  const books=selectedBooks();
  if(!books.length){alert(t('noSelection'));return;}
  if(!confirm(t('bulkDeleteConfirm').replace('{n}',String(books.length))))return;
  state.bulkBusy=true;
  try{
    const r=await fetch('/api/books/bulk-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:books.map(b=>b.key)})});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||t('generalError'));
    const deleted=new Set(d.keys||books.map(b=>b.key));
    state.selectedKeys.clear();state.books=state.books.filter(b=>!deleted.has(b.key));state.achievements=d.achievements||state.achievements;recalcLocalStats();renderCollections();renderSelectOptions();renderAchievements();updateLibraryList();
    if(state.readerKey&&deleted.has(state.readerKey))closeReader();
  }catch(e){alert(e.message||t('generalError'));}
  finally{state.bulkBusy=false;}
}

function bindEvents(){
  $('#libraryTab').onclick=()=>setView('library');$('#achievementsTab').onclick=()=>setView('achievements');$('#refreshBtn').onclick=()=>loadBooks();$('#closeReader').onclick=closeReader;
  $('#themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';localStorage.setItem('bookroom.theme',state.theme);applyI18n();};$('#languageBtn').onclick=()=>{state.language=state.language==='ru'?'en':'ru';localStorage.setItem('bookroom.language',state.language);applyI18n();};
  $('#search').oninput=e=>{state.search=e.target.value;updateLibraryList();};$('#sortSelect').onchange=e=>{state.sort=e.target.value;updateLibraryList();};$('#folderSelect').onchange=e=>{state.folder=e.target.value;renderCollections();updateLibraryList();};$('#tagSelect').onchange=e=>{state.tag=e.target.value;updateLibraryList();};
  $$('#filters .filter').forEach(btn=>btn.onclick=()=>{state.filter=btn.dataset.filter;$$('#filters .filter').forEach(x=>x.classList.toggle('active',x===btn));updateLibraryList();});
  const open=()=>openAddBook();$('#addBtn').onclick=open;$('#emptyAddBtn').onclick=open;$('#newFolderBtn').onclick=openNewFolder;$('#multiImportBtn').onclick=openMultiImport;$('#selectAllVisible').onclick=selectVisibleBooks;$('#clearSelection').onclick=clearSelection;$('#bulkCollectionsBtn').onclick=openBulkCollections;$('#bulkDeleteBtn').onclick=bulkDelete;
  $('#closeDialog').onclick=()=>{$('#addDialog').close();state.editingKey=null;};$('#cancelDialog').onclick=()=>{$('#addDialog').close();state.editingKey=null;};$('#dialogDeleteBtn').onclick=async()=>{const b=state.books.find(x=>x.key===state.editingKey);$('#addDialog').close();if(b)await deleteBook(b);state.editingKey=null;};$('#bookForm').onsubmit=e=>{e.preventDefault();submitBook(e.currentTarget);};
  $('#pdfInput').onchange=()=>{const f=$('#pdfInput').files[0];if(f)$('#fileLabel').textContent=f.name;};$('#dropzone').ondragover=e=>{e.preventDefault();e.currentTarget.classList.add('dragging');};$('#dropzone').ondragleave=e=>e.currentTarget.classList.remove('dragging');$('#dropzone').ondrop=e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');const f=[...e.dataTransfer.files].find(x=>x.type==='application/pdf'||x.name.toLowerCase().endsWith('.pdf'));if(f){const dt=new DataTransfer();dt.items.add(f);$('#pdfInput').files=dt.files;$('#fileLabel').textContent=f.name;}};
  $('#closeFolderDialog').onclick=()=>$('#folderDialog').close();$('#cancelFolderDialog').onclick=()=>$('#folderDialog').close();$('#folderForm').onsubmit=e=>{e.preventDefault();createFolder();};
  $('#closeAddToFolderDialog').onclick=closeAddToFolderDialog;$('#cancelAddToFolderDialog').onclick=closeAddToFolderDialog;$('#addToFolderForm').onsubmit=e=>{e.preventDefault();if(state.selectedKeys.size>1&&!state.activeFolderBook)bulkAddToCollections();else addBookToFolder();};
}

async function boot(){const config=await fetch('/api/config').then(r=>r.json()).catch(()=>({}));state.config=config;state.language=localStorage.getItem('bookroom.language')||config.defaultLanguage||'ru';state.theme=localStorage.getItem('bookroom.theme')||config.defaultTheme||'dark';applyTheme();applyI18n();bindEvents();applyView();await loadBooks();startLiveUpdates();}
boot();
