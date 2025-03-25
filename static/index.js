// Custom select functionality
document.querySelectorAll('.custom-select').forEach(select => {
     const selected = select.querySelector('.select-selected');
     const items = select.querySelector('.select-items');
     const options = select.querySelectorAll('.select-item');
     const hiddenInput = select.querySelector('input[type="hidden"]');

     selected.addEventListener('click', () => {
         items.classList.toggle('show');
         selected.classList.toggle('active');
     });

     options.forEach(option => {
         option.addEventListener('click', () => {
             const value = option.getAttribute('data-value');
             selected.textContent = option.textContent;
             hiddenInput.value = value;

             options.forEach(opt => opt.classList.remove('selected'));
             option.classList.add('selected');

             items.classList.remove('show');
             selected.classList.remove('active');
         });
     });

     document.addEventListener('click', (e) => {
         if (!select.contains(e.target)) {
             items.classList.remove('show');
             selected.classList.remove('active');
         }
     });
 });

 // Theme toggle functionality
 const themeSwitch = document.getElementById('theme-switch');

 function applyTheme(isLightTheme) {
     if (isLightTheme) {
         document.body.style.setProperty('--bg', 'var(--light-bg)');
         document.body.style.setProperty('--text', 'var(--light-text)');
         document.body.style.setProperty('--accent', 'var(--light-accent)');
         document.body.style.setProperty('--glass-bg', 'var(--light-glass)');
         document.body.style.setProperty('--glass-border', 'var(--light-glass-border)');
         document.body.style.setProperty('--glass-shadow', 'var(--light-glass-shadow)');
         document.body.classList.add('light-theme');
     } else {
         document.body.style.setProperty('--bg', 'var(--dark-bg)');
         document.body.style.setProperty('--text', 'var(--dark-text)');
         document.body.style.setProperty('--accent', 'var(--dark-accent)');
         document.body.style.setProperty('--glass-bg', 'var(--dark-glass)');
         document.body.style.setProperty('--glass-border', 'var(--dark-glass-border)');
         document.body.style.setProperty('--glass-shadow', 'var(--dark-glass-shadow)');
         document.body.classList.remove('light-theme');
     }
 }

 function saveThemePreference(isLightTheme) {
     localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
 }

 function loadThemePreference() {
     const savedTheme = localStorage.getItem('theme');
     if (savedTheme === 'light') {
         themeSwitch.checked = true;
         applyTheme(true);
     } else if (savedTheme === 'dark') {
         themeSwitch.checked = false;
         applyTheme(false);
     }
 }

 themeSwitch.addEventListener('change', function () {
     applyTheme(this.checked);
     saveThemePreference(this.checked);
 });

 loadThemePreference();

 function saveThemePreference(isLightTheme) {
     localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
 }

 function loadThemePreference() {
     const savedTheme = localStorage.getItem('theme');
     if (savedTheme === 'light') {
         themeSwitch.checked = true;
         applyTheme(true);
     } else if (savedTheme === 'dark') {
         themeSwitch.checked = false;
         applyTheme(false);
     }
 }

 themeSwitch.addEventListener('change', function () {
     applyTheme(this.checked);
     saveThemePreference(this.checked);
 });

 loadThemePreference();

 // Main application logic
 let currentBatchId = null;
 const processingTasks = new Set();
 const upscaleButton = document.getElementById('upscaleBtn');
 const imageCounterLabel = document.getElementById('imageCounter');
 const addedImagesLabelElement = document.getElementById('addedImagesLabel');
 const fileInput = document.getElementById('fileInput');
 const dropZone = document.getElementById('dropZone');

 function handleDragOver(e) {
     e.preventDefault();
     dropZone.style.borderColor = "var(--primary-light)";
     dropZone.style.background = "rgba(255, 255, 255, 0.1)";
 }

 function handleDrop(e) {
     e.preventDefault();
     dropZone.style.borderColor = "var(--accent)";
     dropZone.style.background = "rgba(255, 255, 255, 0.05)";
     const files = e.dataTransfer.files;
     if (files.length > 0) {
         fileInput.files = files;
         updatePreviews();
     }
 }

 dropZone.addEventListener('dragleave', () => {
     dropZone.style.borderColor = "var(--accent)";
     dropZone.style.background = "rgba(255, 255, 255, 0.05)";
 });

 function updatePreviews() {
     const container = document.getElementById('addedImagesContainer');
     const files = fileInput.files;
     container.innerHTML = '';
     imageCounterLabel.textContent = `Added Images: ${files.length}`;
     upscaleButton.disabled = files.length === 0;

     Array.from(files).forEach((file, index) => {
         const reader = new FileReader();
         reader.onload = (e) => {
             const card = document.createElement('div');
             card.className = 'file-card';
             card.innerHTML = `
         <img class="preview-image" src="${e.target.result}">
         <button class="remove-btn btn-danger" onclick="removeImage(${index})"><i class="fas fa-trash"></i></button>
     `;
             container.appendChild(card);
         };
         reader.readAsDataURL(file);
     });
 }

 function removeImage(index) {
     const dt = new DataTransfer();
     const files = Array.from(fileInput.files);
     files.splice(index, 1);
     files.forEach(file => dt.items.add(file));
     fileInput.files = dt.files;
     updatePreviews();
 }

 function trackProgress(taskId, index) {
     const interval = setInterval(async () => {
         try {
             const response = await fetch(`/progress/${taskId}`);
             if (!response.ok) {
                 clearInterval(interval);
                 return;
             }
             const progressData = await response.json();

             if (progressData.status === 'completed') {
                 clearInterval(interval);
                 processingTasks.delete(taskId);
                 addProcessedImage(progressData);
             } else if (progressData.status === 'error') {
                 clearInterval(interval);
                 processingTasks.delete(taskId);
                 alert(`Error processing image: ${progressData.error}`);
             }
         } catch (error) {
             clearInterval(interval);
         }
     }, 500);
 }

 async function trackTotalProgress(batchId) {
     const interval = setInterval(async () => {
         try {
             const response = await fetch(`/batch_progress/${batchId}`);
             if (!response.ok) {
                 clearInterval(interval);
                 return;
             }

             const progressData = await response.json();
             const totalProgressBar = document.querySelector('.total-progress-bar');
             const totalProgressText = document.querySelector('.total-progress-text');

             if (progressData.status === 'processing') {
                 const percent = progressData.progress;
                 totalProgressBar.style.width = `${percent}%`;
                 totalProgressText.textContent = `${percent}%`;
                 totalProgressBar.style.background = `linear-gradient(90deg, var(--primary-color) ${percent}%, var(--primary-light) 100%)`;
             } else if (progressData.status === 'completed') {
                 totalProgressBar.style.width = `100%`;
                 totalProgressText.textContent = `100%`;
                 clearInterval(interval);
                 document.getElementById('cancelBtn').classList.add('hidden');
                 document.getElementById('downloadAllBtn').classList.remove('hidden');
                 currentBatchId = null;
             } else if (progressData.status === 'error') {
                 totalProgressBar.style.background = '#ef4444';
                 totalProgressText.textContent = 'Error';
                 clearInterval(interval);
                 document.getElementById('cancelBtn').classList.add('hidden');
                 alert(`Batch Error: ${progressData.error}`);
             }
         } catch (error) {
             clearInterval(interval);
         }
     }, 1000);
 }

 async function startProcessing() {
     const files = fileInput.files;
     if (files.length === 0) return;

     addedImagesLabelElement.textContent = 'Uploaded Images';
     dropZone.classList.add('hidden');

     // Hide upscale button and show cancel button
     upscaleButton.classList.add('hidden');
     document.getElementById('cancelBtn').classList.remove('hidden');

     document.querySelector('.total-progress-container').style.display = 'block';

     const formData = new FormData();
     Array.from(files).forEach(file => formData.append('files', file));
     formData.append('model', document.querySelector('input[name="model"]').value);
     formData.append('gpu_id', document.querySelector('input[name="gpu_id"]').value);
     if (document.querySelector('input[name="tta"]').checked) formData.append('tta', 'on');

     try {
         const response = await fetch('/process', { method: 'POST', body: formData });
         const data = await response.json();
         currentBatchId = data.batch_id;

         data.task_ids.forEach((taskId, index) => {
             processingTasks.add(taskId);
             trackProgress(taskId, index);
         });

         trackTotalProgress(currentBatchId);
     } catch (error) {
         alert("Failed to start processing");
         resetUIState();
     }
 }

 async function trackTotalProgress(batchId) {
     const interval = setInterval(async () => {
         try {
             const response = await fetch(`/batch_progress/${batchId}`);
             if (!response.ok) {
                 clearInterval(interval);
                 return;
             }

             const progressData = await response.json();
             const totalProgressBar = document.querySelector('.total-progress-bar');
             const totalProgressText = document.querySelector('.total-progress-text');

             if (progressData.status === 'processing') {
                 const percent = progressData.progress;
                 totalProgressBar.style.width = `${percent}%`;
                 totalProgressText.textContent = `${percent}%`;
                 totalProgressBar.style.background = `linear-gradient(90deg, var(--primary-color) ${percent}%, var(--primary-light) 100%)`;
             } else if (progressData.status === 'completed') {
                 totalProgressBar.style.width = `100%`;
                 totalProgressText.textContent = `100%`;
                 clearInterval(interval);

                 // Hide cancel button and show download all button
                 document.getElementById('cancelBtn').classList.add('hidden');
                 document.getElementById('downloadAllBtn').classList.remove('hidden');

                 currentBatchId = null;
             } else if (progressData.status === 'error') {
                 totalProgressBar.style.background = '#ef4444';
                 totalProgressText.textContent = 'Error';
                 clearInterval(interval);
                 document.getElementById('cancelBtn').classList.add('hidden');
                 alert(`Batch Error: ${progressData.error}`);
             }
         } catch (error) {
             clearInterval(interval);
         }
     }, 1000);
 }

 function resetUIState() {
     addedImagesLabelElement.textContent = 'Added Images';
     dropZone.classList.remove('hidden');

     // Show upscale button, hide cancel and download buttons
     upscaleButton.classList.remove('hidden');
     document.getElementById('cancelBtn').classList.add('hidden');
     document.getElementById('downloadAllBtn').classList.add('hidden');

     document.querySelector('.total-progress-container').style.display = 'none';
 }

 function addProcessedImage(data) {
     const container = document.getElementById('processedImagesContainer');
     const card = document.createElement('div');
     card.className = 'file-card';

     const img = document.createElement('img');
     img.className = 'preview-image';
     img.src = `/processed/${data.output_filename}?t=${Date.now()}`;
     img.alt = data.output_filename;

     const downloadLink = document.createElement('a');
     downloadLink.className = 'download-btn btn-success';
     downloadLink.href = `/processed/${data.output_filename}`;
     downloadLink.download = data.output_filename;
     downloadLink.innerHTML = '<i class="fas fa-download"></i>';

     card.appendChild(img);
     card.appendChild(downloadLink);
     container.appendChild(card);
 }

 async function cancelProcessing() {
     if (!currentBatchId) return;

     try {
         await fetch(`/cancel_batch/${currentBatchId}`, { method: 'POST' });
         document.getElementById('cancelBtn').classList.add('hidden');
         document.querySelector('.total-progress-container').style.display = 'none';
         currentBatchId = null;
     } catch (error) {
         console.error('Error cancelling processing:', error);
     }
 }

 function downloadAll() {
     const processedImages = document.querySelectorAll('#processedImagesContainer img.preview-image');
     if (!processedImages.length) return;

     const zip = new JSZip();
     const promises = [];

     processedImages.forEach((img, index) => {
         const filename = img.alt || `processed_${index}.png`;
         const promise = fetch(img.src)
             .then(response => response.blob())
             .then(blob => zip.file(filename, blob));
         promises.push(promise);
     });

     Promise.all(promises).then(() => {
         zip.generateAsync({ type: 'blob' }).then(content => {
             const link = document.createElement('a');
             link.href = URL.createObjectURL(content);
             link.download = 'Enhanced-Images.zip';
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             URL.revokeObjectURL(link.href);
         });
     }).catch(error => {
         alert('Failed to create ZIP archive');
         console.error('ZIP creation error:', error);
     });
 }

 function resetUIState() {
     addedImagesLabelElement.textContent = 'Added Images';
     dropZone.classList.remove('hidden');
     upscaleButton.classList.remove('hidden');
     document.getElementById('cancelBtn').classList.add('hidden');
     document.querySelector('.total-progress-container').style.display = 'none';
 }

 // Event listeners
 dropZone.addEventListener('click', () => fileInput.click());
 fileInput.addEventListener('change', updatePreviews);

 // Initial setup
 updatePreviews();

 // Keyboard navigation for dropdowns
 document.querySelectorAll('.custom-select').forEach(select => {
     const items = select.querySelector('.select-items');
     const options = select.querySelectorAll('.select-item');

     select.addEventListener('keydown', (e) => {
         const isOpen = items.classList.contains('show');
         const selected = select.querySelector('.select-selected');
         const activeItem = select.querySelector('.select-item.selected');
         let index = Array.from(options).indexOf(activeItem);

         switch (e.key) {
             case 'Enter':
             case ' ':
                 if (!isOpen) {
                     items.classList.add('show');
                     selected.classList.add('active');
                 } else if (document.activeElement.classList.contains('select-item')) {
                     document.activeElement.click();
                 }
                 e.preventDefault();
                 break;
             case 'Escape':
                 items.classList.remove('show');
                 selected.classList.remove('active');
                 break;
             case 'ArrowDown':
                 if (!isOpen) {
                     items.classList.add('show');
                     selected.classList.add('active');
                 } else {
                     if (index < options.length - 1) index++;
                     options[index].focus();
                 }
                 e.preventDefault();
                 break;
             case 'ArrowUp':
                 if (isOpen && index > 0) index--;
                 options[index].focus();
                 e.preventDefault();
                 break;
         }
     });

     options.forEach(option => option.setAttribute('tabindex', '0'));
 });

 // Responsive adjustments
 window.addEventListener('resize', adjustForMobile);
 adjustForMobile();

 function adjustForMobile() {
     const grids = document.querySelectorAll('.preview-grid');
     grids.forEach(grid => {
         grid.style.gridTemplateColumns = window.innerWidth <= 768 ?
             'repeat(auto-fill, minmax(130px, 1fr))' :
             'repeat(auto-fill, minmax(180px, 1fr))';
     });
 }