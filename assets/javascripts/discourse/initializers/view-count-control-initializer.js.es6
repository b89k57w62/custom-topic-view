import { withPluginApi } from "discourse/lib/plugin-api";
import { ajax } from "discourse/lib/ajax";

export default {
  name: "view-count-control-initializer",
  
  initialize() {
    withPluginApi("0.8.31", api => {
      // Global function for editing view count from topic list
      window.editViewCount = function(topicId) {
        const button = document.querySelector(`[data-topic-id="${topicId}"] .view-count-edit-btn`);
        if (!button) return;
        
        const icon = button.querySelector('.d-icon');
        const isCurrentlyCustom = icon && icon.classList.contains('d-icon-eye');
        
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
        if (!button) return;
        
        const icon = button.querySelector('.d-icon');
        const btnText = button.querySelector('.btn-text');
        
        if (useCustom && customCount > 0) {
          // Update button to show custom count
          if (icon) {
            icon.className = 'd-icon d-icon-eye';
          }
          if (btnText) {
            btnText.textContent = customCount;
          }
          button.title = I18n.t('js.view_count_control.disable_custom');
          
          // Hide original view count if setting is enabled
          if (window.Discourse?.SiteSettings?.view_count_hide_original) {
            const originalViews = document.querySelector(`[data-topic-id="${topicId}"] .views .number`);
            if (originalViews) {
              originalViews.style.display = 'none';
            }
          }
        } else {
          // Update button to show edit state
          if (icon) {
            icon.className = 'd-icon d-icon-edit';
          }
          if (btnText) {
            btnText.textContent = I18n.t('js.view_count_control.edit_view_count');
          }
          button.title = I18n.t('js.view_count_control.enable_custom');
          
          // Show original view count
          const originalViews = document.querySelector(`[data-topic-id="${topicId}"] .views .number`);
          if (originalViews) {
            originalViews.style.display = '';
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
          const icon = button.querySelector('.d-icon');
          const isCustom = icon && icon.classList.contains('d-icon-eye');
          
          if (isCustom) {
            const btnText = button.querySelector('.btn-text');
            const customCount = btnText ? parseInt(btnText.textContent) || 0 : 0;
            updateViewCountInDOM(topicId, customCount, true);
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