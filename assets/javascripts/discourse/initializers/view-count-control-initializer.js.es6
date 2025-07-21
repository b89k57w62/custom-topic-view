import { withPluginApi } from "discourse/lib/plugin-api";
import { ajax } from "discourse/lib/ajax";
import { formatViewCount } from "../lib/view-count-formatter";

export default {
  name: "view-count-control-initializer",
  
  initialize() {
    withPluginApi("0.8.31", api => {
      const REQUEST_CACHE = new Map();
      const REQUEST_QUEUE = new Map();
      const LAST_REQUEST_TIME = new Map();
      const MIN_REQUEST_INTERVAL = 1000;
      const MAX_REQUESTS_PER_MINUTE = 20;
      const requestTimestamps = [];

      function canMakeRequest(key = 'global') {
        const now = Date.now();
        const lastTime = LAST_REQUEST_TIME.get(key) || 0;
        
        if (now - lastTime < MIN_REQUEST_INTERVAL) {
          return false;
        }
        
        const oneMinuteAgo = now - 60000;
        while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
          requestTimestamps.shift();
        }
        
        if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
          return false;
        }
        
        return true;
      }

      function recordRequest(key = 'global') {
        const now = Date.now();
        LAST_REQUEST_TIME.set(key, now);
        requestTimestamps.push(now);
      }

      function throttledAjax(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options.data || {})}`;
        
        if (REQUEST_CACHE.has(cacheKey)) {
          const cached = REQUEST_CACHE.get(cacheKey);
          if (Date.now() - cached.timestamp < 30000) {
            return Promise.resolve(cached.data);
          }
        }
        
        if (REQUEST_QUEUE.has(cacheKey)) {
          return REQUEST_QUEUE.get(cacheKey);
        }
        
        if (!canMakeRequest(url)) {
          return Promise.reject(new Error('Rate limit exceeded'));
        }
        
        recordRequest(url);
        
        const promise = ajax(url, options)
          .then(response => {
            REQUEST_CACHE.set(cacheKey, {
              data: response,
              timestamp: Date.now()
            });
            return response;
          })
          .finally(() => {
            REQUEST_QUEUE.delete(cacheKey);
          });
        
        REQUEST_QUEUE.set(cacheKey, promise);
        return promise;
      }

      function batchGetTopicsInfo(topicIds) {
        if (topicIds.length === 0) return Promise.resolve([]);
        
        const batches = [];
        for (let i = 0; i < topicIds.length; i += 5) {
          batches.push(topicIds.slice(i, i + 5));
        }
        
        return Promise.all(
          batches.map((batch, index) => {
            return new Promise(resolve => {
              setTimeout(() => {
                const promises = batch.map(topicId => 
                  throttledAjax(`/t/${topicId}.json`)
                    .catch(() => null)
                );
                Promise.all(promises).then(resolve);
              }, index * 200);
            });
          })
        ).then(results => results.flat().filter(Boolean));
      }

      window.editViewCount = function(topicId) {
        const button = document.querySelector(`[data-topic-id="${topicId}"] .view-count-edit-btn`);
        if (!button) return;
        
        const isCurrentlyCustom = button.classList.contains('custom-active');
        
        if (isCurrentlyCustom) {
          updateViewCount(topicId, 0, false);
        } else {
          const currentViewCount = getCurrentViewCount(topicId);
          const newViewCount = prompt(I18n.t('js.view_count_control.set_custom_views'), currentViewCount);
          
          if (newViewCount !== null) {
            const parsedCount = parseInt(newViewCount) || 0;
            if (parsedCount > 0) {
              updateViewCount(topicId, parsedCount, true);
            }
          }
        }
      };
      
      function getCurrentViewCount(topicId) {
        const customSpan = document.querySelector(`[data-topic-id="${topicId}"] .custom-view-count`);
        if (customSpan) {
          return customSpan.textContent.replace(/[^\d]/g, '');
        }
        
        const viewsElement = document.querySelector(`[data-topic-id="${topicId}"] .views .number`);
        if (viewsElement) {
          return viewsElement.textContent.replace(/[^\d]/g, '');
        }
        
        return '0';
      }
      
      function updateViewCount(topicId, customCount, useCustom) {
        if (!canMakeRequest(`update_${topicId}`)) {
          console.warn('Rate limit: Too many update requests');
          return;
        }
        
        recordRequest(`update_${topicId}`);
        
        throttledAjax(`/t/${topicId}`, {
          type: "PUT",
          data: { 
            custom_view_count: customCount,
            use_custom_view_count: useCustom
          }
        }).then(() => {
          updateViewCountInDOM(topicId, customCount, useCustom);
        }).catch(error => {
          if (error.message !== 'Rate limit exceeded') {
            console.error('Failed to update view count:', error);
          }
        });
      }
      
      function updateViewCountInDOM(topicId, customCount, useCustom) {
        const button = document.querySelector(`[data-topic-id="${topicId}"] .view-count-edit-btn`);
        const topicRow = document.querySelector(`[data-topic-id="${topicId}"]`);
        if (!topicRow) return;
        
        const originalViews = topicRow.querySelector('.views .number');
        const viewsContainer = topicRow.querySelector('.views');
        
        if (useCustom && customCount > 0) {
          if (button) {
            button.classList.add('custom-active');
            button.title = I18n.t('js.view_count_control.disable_custom');
          }
          
          if (originalViews) {
            originalViews.textContent = formatViewCount(customCount);
            originalViews.setAttribute('data-custom-view', 'true');
          } else if (viewsContainer) {
            const customViewElement = document.createElement('span');
            customViewElement.className = 'number';
            customViewElement.textContent = formatViewCount(customCount);
            customViewElement.setAttribute('data-custom-view', 'true');
            viewsContainer.appendChild(customViewElement);
          }
        } else {
          if (button) {
            button.classList.remove('custom-active');
            button.title = I18n.t('js.view_count_control.enable_custom');
          }
          
          if (originalViews && originalViews.getAttribute('data-custom-view')) {
            originalViews.removeAttribute('data-custom-view');
          }
        }
      }
      
      api.onPageChange((url, title) => {
        setTimeout(() => {
          applyViewCountControlToAllTopics();
        }, 1000);
      });
      
      function applyViewCountControlToAllTopics() {
        const topics = document.querySelectorAll('.topic-list-item[data-topic-id]');
        const topicIds = Array.from(topics).map(topic => topic.dataset.topicId).filter(Boolean);
        
        if (topicIds.length === 0) return;
        
        batchGetTopicsInfo(topicIds).then(responses => {
          responses.forEach(response => {
            if (response && response.id) {
              const topicElement = document.querySelector(`[data-topic-id="${response.id}"]`);
              if (topicElement) {
                updateViewCountInDOM(
                  response.id, 
                  response.custom_view_count || 0, 
                  response.use_custom_view_count || false
                );
              }
            }
          });
        }).catch(error => {
          console.warn('Failed to batch load topic info:', error);
        });
      }
      
      setTimeout(() => {
        applyViewCountControlToAllTopics();
      }, 1500);
    });
  }
}; 