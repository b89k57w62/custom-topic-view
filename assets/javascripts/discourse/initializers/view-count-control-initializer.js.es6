import { withPluginApi } from "discourse/lib/plugin-api";
import { ajax } from "discourse/lib/ajax";
import { formatViewCount } from "../lib/view-count-formatter";

export default {
  name: "view-count-control-initializer",
  
  initialize() {
    withPluginApi("0.8.31", api => {
      // Global function for editing view count from topic list
      window.editViewCount = function(topicId) {
        const button = document.querySelector(`[data-topic-id="${topicId}"] .view-count-edit-btn`);
        if (!button) return;
        
        const isCurrentlyCustom = button.classList.contains('custom-active');
        
        if (isCurrentlyCustom) {
          // Currently showing custom, switch back to original
          updateViewCount(topicId, 0, false);
        } else {
          // Currently showing original, ask for custom count
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
        
        // Try to get from topic list views
        const viewsElement = document.querySelector(`[data-topic-id="${topicId}"] .views .number`);
        if (viewsElement) {
          return viewsElement.textContent.replace(/[^\d]/g, '');
        }
        
        return '0';
      }
      
      function updateViewCount(topicId, customCount, useCustom) {
        ajax(`/t/${topicId}`, {
          type: "PUT",
          data: { 
            custom_view_count: customCount,
            use_custom_view_count: useCustom
          }
        }).then(() => {
          updateViewCountInDOM(topicId, customCount, useCustom);
        }).catch(error => {
          console.error('Failed to update view count:', error);
        });
      }
      
      function updateViewCountInDOM(topicId, customCount, useCustom) {
        const button = document.querySelector(`[data-topic-id="${topicId}"] .view-count-edit-btn`);
        const topicRow = document.querySelector(`[data-topic-id="${topicId}"]`);
        if (!topicRow) return;
        
        const originalViews = topicRow.querySelector('.views .number');
        const viewsContainer = topicRow.querySelector('.views');
        
        if (useCustom && customCount > 0) {
          // Update button state
          if (button) {
            button.classList.add('custom-active');
            button.title = I18n.t('js.view_count_control.disable_custom');
          }
          
          // Replace original view count with custom count in the same position
          if (originalViews) {
            originalViews.textContent = formatViewCount(customCount);
            originalViews.setAttribute('data-custom-view', 'true');
          } else if (viewsContainer) {
            // Create custom view count element if original doesn't exist
            const customViewElement = document.createElement('span');
            customViewElement.className = 'number';
            customViewElement.textContent = formatViewCount(customCount);
            customViewElement.setAttribute('data-custom-view', 'true');
            viewsContainer.appendChild(customViewElement);
          }
        } else {
          // Update button state
          if (button) {
            button.classList.remove('custom-active');
            button.title = I18n.t('js.view_count_control.enable_custom');
          }
          
          // Restore original view count
          if (originalViews && originalViews.getAttribute('data-custom-view')) {
            // Need to fetch original count
            ajax(`/t/${topicId}.json`).then(response => {
              if (response && response.views !== undefined) {
                originalViews.textContent = formatViewCount(response.views);
                originalViews.removeAttribute('data-custom-view');
              }
            }).catch(() => {
              // Fallback: just remove the custom marker
              originalViews.removeAttribute('data-custom-view');
            });
          }
        }
      }
      
      // Apply view count control on page load
      api.onPageChange((url, title) => {
        setTimeout(() => {
          applyViewCountControlToAllTopics();
        }, 500);
      });
      
      function applyViewCountControlToAllTopics() {
        const topics = document.querySelectorAll('.topic-list-item[data-topic-id]');
        
        topics.forEach(topic => {
          const topicId = topic.dataset.topicId;
          if (topicId) {
            checkAndApplyViewCountState(topicId, topic);
          }
        });
      }
      
      function checkAndApplyViewCountState(topicId, topicElement) {
        const button = topicElement.querySelector('.view-count-edit-btn');
        if (button) {
          const isCustom = button.classList.contains('custom-active');
          
          if (isCustom) {
            // Get custom count from topic data
            ajax(`/t/${topicId}.json`).then(response => {
              if (response && response.custom_view_count) {
                updateViewCountInDOM(topicId, response.custom_view_count, true);
              }
            }).catch(() => {
              // Silently handle errors
            });
          }
          return;
        }
        
        // Fetch topic data to determine state
        ajax(`/t/${topicId}.json`).then(response => {
          if (response && response.use_custom_view_count !== undefined) {
            const useCustom = response.use_custom_view_count;
            const customCount = response.custom_view_count || 0;
            updateViewCountInDOM(topicId, customCount, useCustom);
          }
        }).catch(error => {
          // Silently handle errors
        });
      }
      
      // Initial application
      setTimeout(() => {
        applyViewCountControlToAllTopics();
      }, 1000);
    });
  }
}; 